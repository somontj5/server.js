#!/usr/bin/env python3
"""Compile the native Android shell, not just WebView assets. Uses installed SDK."""
import os, pathlib, subprocess, zipfile
R=pathlib.Path(__file__).resolve().parent
os.chdir(R)
B=R/'.local-build/native'; B.mkdir(parents=True,exist_ok=True)
SDK=pathlib.Path(os.environ['ANDROID_HOME'])
T=SDK/'build-tools/35.0.0'; J=SDK/'platforms/android-35/android.jar'
def run(*args): subprocess.run([str(x) for x in args],check=True)
res=B/'res'; (res/'values').mkdir(parents=True,exist_ok=True)
(res/'values/strings.xml').write_text('<resources><string name="app_name">СтеклоМаркет</string></resources>')
with zipfile.ZipFile(R/'apk/GlassMarket9.12.apk') as old:
 for name in old.namelist():
  if name.startswith('res/mipmap-') and name.endswith('/ic_launcher.png'):
   folder=name.split('/')[1].replace('-v4','');p=res/folder/'ic_launcher.png';p.parent.mkdir(exist_ok=True);p.write_bytes(old.read(name))
classes=B/'classes';classes.mkdir(exist_ok=True)
run(T/'aapt','package','-f','-M',R/'android-src/AndroidManifest.xml','-S',res,'-I',J,'-F',B/'base.apk')
run('javac','-source','8','-target','8','-bootclasspath',J,'-d',classes,*sorted((R/'android-src/src').rglob('*.java')))
run(T/'d8','--min-api','24','--lib',J,'--output',B,*sorted(classes.rglob('*.class')))
with zipfile.ZipFile(B/'base.apk') as old, zipfile.ZipFile(B/'unsigned.apk','w') as out:
 for item in old.infolist():out.writestr(item,old.read(item))
 out.write(B/'classes.dex','classes.dex')
 for p in (R/'android-src/assets').rglob('*'):
  if p.is_file():out.write(p,'assets/'+p.relative_to(R/'android-src/assets').as_posix(),compress_type=zipfile.ZIP_DEFLATED)
run(T/'zipalign','-f','-p','4',B/'unsigned.apk',R/'apk/GlassMarket9.13-unsigned.apk')
run(T/'aapt','dump','badging',R/'apk/GlassMarket9.13-unsigned.apk')
