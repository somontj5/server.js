# Сборка APK с подписью v1+v2 (нужна для targetSdk>=30). python3 sign2.py <папка> <out.apk> <исходный.apk>
import zipfile,hashlib,base64,struct,os,sys,io,datetime
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes,serialization
from cryptography.hazmat.primitives.asymmetric import rsa,padding
from cryptography.hazmat.primitives.serialization import pkcs7
src,out,orig=sys.argv[1:4];kp,cp='gm_key.pem','gm_cert.pem'
if not os.path.exists(kp):
    k=rsa.generate_private_key(public_exponent=65537,key_size=2048);n=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'GlassMarket')])
    c=x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(x509.random_serial_number()).not_valid_before(datetime.datetime(2020,1,1)).not_valid_after(datetime.datetime(2055,1,1)).sign(k,hashes.SHA256())
    open(kp,'wb').write(k.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()));open(cp,'wb').write(c.public_bytes(serialization.Encoding.PEM))
k=serialization.load_pem_private_key(open(kp,'rb').read(),None);c=x509.load_pem_x509_certificate(open(cp,'rb').read())
o=zipfile.ZipFile(orig);names=[i.filename for i in o.infolist() if not i.filename.startswith('META-INF/')]
b64=lambda d:base64.b64encode(d).decode();data={n:open(os.path.join(src,n),'rb').read() for n in names}
mf='Manifest-Version: 1.0\r\nCreated-By: GM\r\n\r\n';se=''
for n in names:
    e='Name: %s\r\nSHA-256-Digest: %s\r\n\r\n'%(n,b64(hashlib.sha256(data[n]).digest()));mf+=e;se+='Name: %s\r\nSHA-256-Digest: %s\r\n\r\n'%(n,b64(hashlib.sha256(e.encode()).digest()))
sf=('Signature-Version: 1.0\r\nCreated-By: GM\r\nSHA-256-Digest-Manifest: %s\r\nX-Android-APK-Signed: 2\r\n\r\n'%b64(hashlib.sha256(mf.encode()).digest())+se).encode()
rs=pkcs7.PKCS7SignatureBuilder().set_data(sf).add_signer(c,k,hashes.SHA256()).sign(serialization.Encoding.DER,[pkcs7.PKCS7Options.DetachedSignature,pkcs7.PKCS7Options.NoAttributes])
buf=io.BytesIO();z=zipfile.ZipFile(buf,'w')
for n in names:
    ct=zipfile.ZIP_STORED if (n=='resources.arsc' or o.getinfo(n).compress_type==0) else zipfile.ZIP_DEFLATED
    zi=zipfile.ZipInfo(n,(2026,10,31,0,0,0));zi.compress_type=ct
    if ct==0:zi.extra=b'\0'*((4-(buf.tell()+30+len(n.encode()))%4)%4)
    z.writestr(zi,data[n])
for n,d in [('META-INF/MANIFEST.MF',mf.encode()),('META-INF/GM.SF',sf),('META-INF/GM.RSA',rs)]:
    zi=zipfile.ZipInfo(n,(2026,10,31,0,0,0));zi.compress_type=8;z.writestr(zi,d)
z.close();a=buf.getvalue()
eo=a.rfind(b'PK\x05\x06');cdo=struct.unpack('<I',a[eo+16:eo+20])[0];s1,s3,s4=a[:cdo],a[cdo:eo],a[eo:]
def dg(*secs):
    ch=[]
    for s in secs:
        for i in range(0,len(s),1048576):p=s[i:i+1048576];ch.append(hashlib.sha256(b'\xa5'+struct.pack('<I',len(p))+p).digest())
    return hashlib.sha256(b'\x5a'+struct.pack('<I',len(ch))+b''.join(ch)).digest()
L=lambda b:struct.pack('<I',len(b))+b
d=dg(s1,s3,s4);cert=c.public_bytes(serialization.Encoding.DER)
sd=L(L(struct.pack('<I',0x0103)+L(d)))+L(L(cert))+L(b'')
sig=k.sign(sd,padding.PKCS1v15(),hashes.SHA256())
pk=k.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo)
val=L(L(L(sd)+L(L(struct.pack('<I',0x0103)+L(sig)))+L(pk)))
pair=struct.pack('<Q',len(val)+4)+struct.pack('<I',0x7109871a)+val
sz=len(pair)+8+16;blk=struct.pack('<Q',sz)+pair+struct.pack('<Q',sz)+b'APK Sig Block 42'
s4=s4[:16]+struct.pack('<I',cdo+len(blk))+s4[20:]
open(out,'wb').write(s1+blk+s3+s4);print('ok',out)
