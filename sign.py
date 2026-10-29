import zipfile,hashlib,base64,datetime,os
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs7
import sys
src=sys.argv[1] if len(sys.argv)>1 else 'apk';out=sys.argv[2] if len(sys.argv)>2 else 'GlassMarket.apk'
kp='gm_key.pem';cp='gm_cert.pem'
if not os.path.exists(kp):
    k=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    n=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'GlassMarket')])
    c=x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(x509.random_serial_number()).not_valid_before(datetime.datetime(2020,1,1)).not_valid_after(datetime.datetime(2055,1,1)).sign(k,hashes.SHA256())
    open(kp,'wb').write(k.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
    open(cp,'wb').write(c.public_bytes(serialization.Encoding.PEM))
k=serialization.load_pem_private_key(open(kp,'rb').read(),None);c=x509.load_pem_x509_certificate(open(cp,'rb').read())
orig=zipfile.ZipFile(sys.argv[3] if len(sys.argv)>3 else '/home/user/uploaded_files/GlassMarket7.9.apk')  # исходный APK (порядок и сжатие файлов)
names=[i.filename for i in orig.infolist() if not i.filename.startswith('META-INF/')]
b64=lambda d:base64.b64encode(d).decode()
mf='Manifest-Version: 1.0\r\nCreated-By: GM\r\n\r\n';sf_ent=''
data={}
for nme in names:
    d=open(os.path.join(src,nme),'rb').read();data[nme]=d
    e='Name: %s\r\nSHA-256-Digest: %s\r\n\r\n'%(nme,b64(hashlib.sha256(d).digest()))
    mf+=e;sf_ent+='Name: %s\r\nSHA-256-Digest: %s\r\n\r\n'%(nme,b64(hashlib.sha256(e.encode()).digest()))
mfb=mf.encode()
sf=('Signature-Version: 1.0\r\nCreated-By: GM\r\nSHA-256-Digest-Manifest: %s\r\n\r\n'%b64(hashlib.sha256(mfb).digest())+sf_ent).encode()
rsa_=pkcs7.PKCS7SignatureBuilder().set_data(sf).add_signer(c,k,hashes.SHA256()).sign(serialization.Encoding.DER,[pkcs7.PKCS7Options.DetachedSignature,pkcs7.PKCS7Options.NoAttributes])
with zipfile.ZipFile(out,'w') as z:
    for nme in names:
        ci=orig.getinfo(nme);comp=ci.compress_type if nme!='resources.arsc' else zipfile.ZIP_STORED
        z.writestr(zipfile.ZipInfo(nme,ci.date_time) if True else None,data[nme],compress_type=comp)
    z.writestr('META-INF/MANIFEST.MF',mfb,zipfile.ZIP_DEFLATED);z.writestr('META-INF/GM.SF',sf,zipfile.ZIP_DEFLATED);z.writestr('META-INF/GM.RSA',rsa_,zipfile.ZIP_DEFLATED)
print('ok')
