#!/usr/bin/env python3
"""Repackage unchanged native shell with versioned WebView source; sign using official apksigner.
Usage: python3 build-apk.py --signer JAR --keystore JKS --password-file FILE
Native classes.dex/resources are intentionally retained; no Android SDK downloads required.
"""
import argparse
import pathlib
import struct
import subprocess
import zipfile
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent

def inside(value):
    path = (ROOT / value).resolve()
    if not path.is_relative_to(ROOT):
        raise ValueError('All build paths must stay inside the workspace')
    return path

def patch_manifest(data, version_code, version_name):
    data = bytearray(data)
    strings, string_positions = [], []
    pool_position = pool_size = 0
    replacement = None
    position = 8
    while position < len(data):
        kind, header_size, chunk_size = struct.unpack_from('<HHI', data, position)
        if kind == 0x0001:
            pool_position, pool_size = position, chunk_size
            count, style_count, flags, strings_start = struct.unpack_from('<IIII', data, position + 8)
            if style_count:
                raise ValueError('Styled string pools are not supported')
            if flags & 0x100:
                raise ValueError('Expected the UTF-16 string pool used by the original shell')
            for i in range(count):
                offset = struct.unpack_from('<I', data, position + header_size + i * 4)[0]
                start = position + strings_start + offset
                length = struct.unpack_from('<H', data, start)[0]
                if length & 0x8000:
                    raise ValueError('Unexpected long AXML string')
                strings.append(bytes(data[start + 2:start + 2 + length * 2]).decode('utf-16-le'))
                string_positions.append((start + 2, length))
        if kind == 0x0102:
            extension = position + 16
            attribute_start, attribute_size, attribute_count = struct.unpack_from('<HHH', data, extension + 8)
            for i in range(attribute_count):
                attribute = extension + attribute_start + i * attribute_size
                name_index, raw_index = struct.unpack_from('<II', data, attribute + 4)
                name = strings[name_index]
                if name == 'versionCode':
                    struct.pack_into('<I', data, attribute + 16, version_code)
                if name == 'versionName':
                    index = raw_index if raw_index != 0xffffffff else struct.unpack_from('<I', data, attribute + 16)[0]
                    replacement = index
        position += chunk_size
    if replacement is None:
        raise ValueError('Missing versionName')
    strings[replacement] = version_name
    offsets, content = [], bytearray()
    for value in strings:
        encoded = value.encode('utf-16-le')
        length = len(encoded) // 2
        if length >= 0x8000:
            raise ValueError('AXML string too long')
        offsets.append(len(content))
        content.extend(struct.pack('<H', length) + encoded + b'\0\0')
    start = 28 + len(offsets) * 4
    content.extend(b'\0' * (-(start + len(content)) % 4))
    pool = struct.pack('<HHIIIIII', 1, 28, start + len(content), len(offsets), 0, 0, start, 0)
    pool += struct.pack('<' + 'I' * len(offsets), *offsets) + content
    data[pool_position:pool_position + pool_size] = pool
    struct.pack_into('<I', data, 4, len(data))
    return bytes(data)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--signer', required=True)
    parser.add_argument('--keystore', required=True)
    parser.add_argument('--password-file', required=True)
    parser.add_argument('--base', default='apk/GlassMarket9.11.apk')
    parser.add_argument('--out', default='apk/GlassMarket9.12.apk')
    args = parser.parse_args()
    source = inside('android-src/assets/www/index.html')
    manifest = ET.parse(inside('android-src/AndroidManifest.xml')).getroot()
    ns = '{http://schemas.android.com/apk/res/android}'
    code, version = int(manifest.attrib[ns + 'versionCode']), manifest.attrib[ns + 'versionName']
    output, temporary = inside(args.out), inside('.local-build/unsigned.apk')
    temporary.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(inside(args.base)) as original, zipfile.ZipFile(temporary, 'w') as target:
        for entry in original.infolist():
            if entry.filename.upper().startswith('META-INF/') or entry.filename.startswith('assets/www/'):
                continue
            content = original.read(entry)
            if entry.filename == 'assets/www/index.html':
                content = source.read_bytes()
            if entry.filename == 'AndroidManifest.xml':
                content = patch_manifest(content, code, version)
            info = zipfile.ZipInfo(entry.filename, (2026, 11, 10, 0, 0, 0))
            info.compress_type = entry.compress_type
            if entry.filename == 'resources.arsc':
                info.compress_type = zipfile.ZIP_STORED
            if info.compress_type == zipfile.ZIP_STORED:
                padding = -(target.fp.tell() + 30 + len(entry.filename.encode())) % 4
                info.extra = struct.pack('<HH', 0xd935, padding) + b'\0' * padding
            target.writestr(info, content)
        for asset in inside('android-src/assets/www').rglob('*'):
            if asset.is_file():
                name = 'assets/www/' + asset.relative_to(inside('android-src/assets/www')).as_posix()
                target.write(asset, name, compress_type=zipfile.ZIP_DEFLATED)
    signer = ['java', '-jar', str(inside(args.signer))]
    subprocess.run(signer + ['sign', '--ks', str(inside(args.keystore)), '--ks-key-alias', 'glassmarket-release',
                            '--ks-pass', 'file:' + str(inside(args.password_file)),
                            '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
                            '--v3-signing-enabled', 'true', '--out', str(output), str(temporary)], check=True)
    subprocess.run(signer + ['verify', '--verbose', '--print-certs', str(output)], check=True)
    with zipfile.ZipFile(output) as built, zipfile.ZipFile(inside(args.base)) as original:
        assert built.read('classes.dex') == original.read('classes.dex'), 'Unexpected native shell change'
        assert len(built.namelist()) == len(set(built.namelist())), 'Duplicate APK entries'
        for asset in inside('android-src/assets/www').rglob('*'):
            if asset.is_file():
                name = 'assets/www/' + asset.relative_to(inside('android-src/assets/www')).as_posix()
                assert built.read(name) == asset.read_bytes(), 'Client asset mismatch: ' + name
    print(f'Built {output.name}; version {version} ({code}); native shell retained and signatures verified')

if __name__ == '__main__':
    main()
