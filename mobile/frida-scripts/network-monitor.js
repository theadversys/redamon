/**
 * Frida Network Monitor Script
 * Hooks Android network APIs to log:
 * - java.net.URL.openConnection
 * - OkHttp3 request URL, method, and headers
 * - javax.net.ssl.HttpsURLConnection details
 */

Java.perform(function () {

  // ── 1. java.net.URL.openConnection ────────────────────────────────────────
  try {
    var URL = Java.use('java.net.URL')
    URL.openConnection.overload().implementation = function () {
      console.log('[Network] URL.openConnection — url: ' + this.toString())
      return this.openConnection()
    }
  } catch (e) {
    console.log('[Network] URL.openConnection hook failed: ' + e)
  }

  // ── 2. HttpURLConnection.connect ──────────────────────────────────────────
  try {
    var HttpURLConnection = Java.use('java.net.HttpURLConnection')
    HttpURLConnection.connect.implementation = function () {
      try {
        console.log('[Network] HttpURLConnection.connect — url: ' + this.getURL().toString())
        console.log('  method: ' + this.getRequestMethod())
      } catch (e) { /* ignore */ }
      return this.connect()
    }
  } catch (e) {
    console.log('[Network] HttpURLConnection.connect hook failed: ' + e)
  }

  // ── 3. HttpsURLConnection — log SSL details ───────────────────────────────
  try {
    var HttpsURLConnection = Java.use('javax.net.ssl.HttpsURLConnection')
    HttpsURLConnection.connect.implementation = function () {
      try {
        console.log('[Network] HttpsURLConnection.connect — url: ' + this.getURL().toString())
        console.log('  cipher suite: ' + this.getCipherSuite())
      } catch (e) { /* ignore */ }
      return this.connect()
    }
  } catch (e) {
    console.log('[Network] HttpsURLConnection.connect hook failed: ' + e)
  }

  // ── 4. OkHttp3 — RealCall.execute ────────────────────────────────────────
  try {
    var RealCall = Java.use('okhttp3.internal.connection.RealCall')
    RealCall.execute.implementation = function () {
      var request = this.request()
      console.log('[Network] OkHttp3 RealCall.execute')
      console.log('  url:    ' + request.url().toString())
      console.log('  method: ' + request.method())
      var headers = request.headers()
      for (var i = 0; i < headers.size(); i++) {
        var name = headers.name(i)
        // Redact Authorization and Cookie header values in output
        var value = (name.toLowerCase() === 'authorization' || name.toLowerCase() === 'cookie')
          ? '[REDACTED]'
          : headers.value(i)
        console.log('  header: ' + name + ': ' + value)
      }
      return this.execute()
    }
  } catch (e) {
    // Try older OkHttp class path
    try {
      var RealCallLegacy = Java.use('okhttp3.RealCall')
      RealCallLegacy.execute.implementation = function () {
        var request = this.request()
        console.log('[Network] OkHttp3 RealCall.execute (legacy)')
        console.log('  url:    ' + request.url().toString())
        console.log('  method: ' + request.method())
        return this.execute()
      }
    } catch (e2) {
      console.log('[Network] OkHttp3 RealCall hook failed: ' + e2)
    }
  }

  // ── 5. OkHttp3 — OkHttpClient.newCall ────────────────────────────────────
  try {
    var OkHttpClient = Java.use('okhttp3.OkHttpClient')
    OkHttpClient.newCall.implementation = function (request) {
      console.log('[Network] OkHttpClient.newCall')
      console.log('  url:    ' + request.url().toString())
      console.log('  method: ' + request.method())
      return this.newCall(request)
    }
  } catch (e) {
    console.log('[Network] OkHttpClient.newCall hook failed: ' + e)
  }

  // ── 6. Volley — HurlStack.createConnection ────────────────────────────────
  try {
    var HurlStack = Java.use('com.android.volley.toolbox.HurlStack')
    HurlStack.createConnection.implementation = function (url) {
      console.log('[Network] Volley HurlStack.createConnection — url: ' + url.toString())
      return this.createConnection(url)
    }
  } catch (e) {
    // Volley may not be present; expected
  }

  console.log('[Network] All network hooks installed')
})
