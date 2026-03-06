/**
 * Frida Crypto Monitor Script
 * Hooks Android javax.crypto and java.security APIs to log:
 * - Cipher algorithms and modes
 * - Secret key bytes (base64)
 * - Hash algorithms
 * - Cipher plaintext input and ciphertext output
 */

var Base64 = Java.use('android.util.Base64')

function toBase64(bytes) {
  try {
    if (bytes === null) return '(null)'
    return Base64.encodeToString(bytes, 0 /* NO_WRAP */)
  } catch (e) {
    return '(encode error)'
  }
}

Java.perform(function () {

  // ── 1. Cipher.getInstance ─────────────────────────────────────────────────
  try {
    var Cipher = Java.use('javax.crypto.Cipher')
    Cipher.getInstance.overload('java.lang.String').implementation = function (transformation) {
      console.log('[Crypto] Cipher.getInstance("' + transformation + '")')
      return this.getInstance(transformation)
    }
    Cipher.getInstance.overload('java.lang.String', 'java.lang.String').implementation = function (transformation, provider) {
      console.log('[Crypto] Cipher.getInstance("' + transformation + '", "' + provider + '")')
      return this.getInstance(transformation, provider)
    }
  } catch (e) {
    console.log('[Crypto] Cipher.getInstance hook failed: ' + e)
  }

  // ── 2. Cipher.doFinal — log plaintext input and ciphertext output ─────────
  try {
    var Cipher2 = Java.use('javax.crypto.Cipher')
    Cipher2.doFinal.overload('[B').implementation = function (input) {
      var result = this.doFinal(input)
      console.log('[Crypto] Cipher.doFinal')
      console.log('  input  (b64): ' + toBase64(input))
      console.log('  output (b64): ' + toBase64(result))
      return result
    }
    Cipher2.doFinal.overload('[B', 'int', 'int').implementation = function (input, offset, len) {
      var result = this.doFinal(input, offset, len)
      console.log('[Crypto] Cipher.doFinal(offset=' + offset + ', len=' + len + ')')
      console.log('  input  (b64): ' + toBase64(input))
      console.log('  output (b64): ' + toBase64(result))
      return result
    }
  } catch (e) {
    console.log('[Crypto] Cipher.doFinal hook failed: ' + e)
  }

  // ── 3. SecretKeySpec — log raw key bytes ──────────────────────────────────
  try {
    var SecretKeySpec = Java.use('javax.crypto.spec.SecretKeySpec')
    SecretKeySpec.$init.overload('[B', 'java.lang.String').implementation = function (keyBytes, algorithm) {
      console.log('[Crypto] SecretKeySpec — algorithm: ' + algorithm + ', key (b64): ' + toBase64(keyBytes))
      return this.$init(keyBytes, algorithm)
    }
    SecretKeySpec.$init.overload('[B', 'int', 'int', 'java.lang.String').implementation = function (keyBytes, offset, len, algorithm) {
      console.log('[Crypto] SecretKeySpec — algorithm: ' + algorithm + ', key (b64): ' + toBase64(keyBytes))
      return this.$init(keyBytes, offset, len, algorithm)
    }
  } catch (e) {
    console.log('[Crypto] SecretKeySpec hook failed: ' + e)
  }

  // ── 4. MessageDigest.getInstance — log hash algorithm ────────────────────
  try {
    var MessageDigest = Java.use('java.security.MessageDigest')
    MessageDigest.getInstance.overload('java.lang.String').implementation = function (algorithm) {
      console.log('[Crypto] MessageDigest.getInstance("' + algorithm + '")')
      return this.getInstance(algorithm)
    }
  } catch (e) {
    console.log('[Crypto] MessageDigest.getInstance hook failed: ' + e)
  }

  // ── 5. IvParameterSpec — log IVs ─────────────────────────────────────────
  try {
    var IvParameterSpec = Java.use('javax.crypto.spec.IvParameterSpec')
    IvParameterSpec.$init.overload('[B').implementation = function (iv) {
      console.log('[Crypto] IvParameterSpec — iv (b64): ' + toBase64(iv))
      return this.$init(iv)
    }
  } catch (e) {
    console.log('[Crypto] IvParameterSpec hook failed: ' + e)
  }

  console.log('[Crypto] All crypto hooks installed')
})
