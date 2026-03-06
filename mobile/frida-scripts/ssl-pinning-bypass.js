/**
 * Frida SSL Pinning Bypass Script
 * Hooks Android TrustManager, HostnameVerifier, and OkHttp3 CertificatePinner
 * to allow traffic capture through a proxy (e.g., Burp Suite / mitmproxy).
 */

Java.perform(function () {

  // ── 1. X509TrustManager — checkServerTrusted ──────────────────────────────
  try {
    var X509TrustManager = Java.use('javax.net.ssl.X509TrustManager')
    X509TrustManager.checkServerTrusted.overload('[Ljava.security.cert.X509Certificate;', 'java.lang.String').implementation = function (chain, authType) {
      console.log('[SSL-Bypass] X509TrustManager.checkServerTrusted bypassed — authType: ' + authType)
    }
  } catch (e) {
    console.log('[SSL-Bypass] X509TrustManager hook failed: ' + e)
  }

  // ── 2. HostnameVerifier — verify ──────────────────────────────────────────
  try {
    var HostnameVerifier = Java.use('javax.net.ssl.HostnameVerifier')
    HostnameVerifier.verify.overload('java.lang.String', 'javax.net.ssl.SSLSession').implementation = function (hostname, session) {
      console.log('[SSL-Bypass] HostnameVerifier.verify bypassed — hostname: ' + hostname)
      return true
    }
  } catch (e) {
    console.log('[SSL-Bypass] HostnameVerifier hook failed: ' + e)
  }

  // ── 3. SSLContext — init with null TrustManager ───────────────────────────
  try {
    var SSLContext = Java.use('javax.net.ssl.SSLContext')
    SSLContext.init.overload('[Ljavax.net.ssl.KeyManager;', '[Ljavax.net.ssl.TrustManager;', 'java.security.SecureRandom').implementation = function (km, tm, sr) {
      console.log('[SSL-Bypass] SSLContext.init called — injecting permissive TrustManager')
      var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl')
      // Build a permissive trust manager array
      var emptyTM = Java.array('Ljavax.net.ssl.TrustManager;', [TrustManagerImpl.$new(null)])
      this.init(km, emptyTM, sr)
    }
  } catch (e) {
    // conscrypt path may not exist on all devices; that is expected
  }

  // ── 4. OkHttp3 CertificatePinner.check ───────────────────────────────────
  try {
    var OkHttpCertPinner = Java.use('okhttp3.CertificatePinner')
    OkHttpCertPinner.check.overload('java.lang.String', 'java.util.List').implementation = function (hostname, peerCertificates) {
      console.log('[SSL-Bypass] OkHttp3 CertificatePinner.check bypassed — hostname: ' + hostname)
    }
    OkHttpCertPinner.check.overload('java.lang.String', '[Ljava.security.cert.Certificate;').implementation = function (hostname, peerCertificates) {
      console.log('[SSL-Bypass] OkHttp3 CertificatePinner.check (legacy) bypassed — hostname: ' + hostname)
    }
  } catch (e) {
    console.log('[SSL-Bypass] OkHttp3 CertificatePinner hook failed (library may not be present): ' + e)
  }

  // ── 5. TrustManagerImpl (Android internal) ───────────────────────────────
  try {
    var TrustManagerImpl = Java.use('com.android.org.conscrypt.TrustManagerImpl')
    TrustManagerImpl.verifyChain.implementation = function (untrustedChain, trustAnchorChain, host, clientAuth, ocspData, tlsSctData) {
      console.log('[SSL-Bypass] conscrypt TrustManagerImpl.verifyChain bypassed — host: ' + host)
      return untrustedChain
    }
  } catch (e) {
    console.log('[SSL-Bypass] conscrypt TrustManagerImpl hook failed: ' + e)
  }

  console.log('[SSL-Bypass] All hooks installed successfully')
})
