/**
 * Frida Storage Monitor Script
 * Hooks Android storage APIs to log:
 * - SharedPreferences key/value writes
 * - FileOutputStream paths and content snippets
 * - SQLiteDatabase execSQL statements
 */

Java.perform(function () {

  // ── 1. SharedPreferences — putString ─────────────────────────────────────
  try {
    var SharedPreferencesEditor = Java.use('android.app.SharedPreferencesImpl$EditorImpl')
    SharedPreferencesEditor.putString.implementation = function (key, value) {
      console.log('[Storage] SharedPreferences.putString')
      console.log('  key:   ' + key)
      console.log('  value: ' + (value !== null ? String(value).substring(0, 200) : '(null)'))
      return this.putString(key, value)
    }
  } catch (e) {
    // Try alternate class path
    try {
      var SharedPrefsEditor = Java.use('android.content.SharedPreferences$Editor')
      SharedPrefsEditor.putString.implementation = function (key, value) {
        console.log('[Storage] SharedPreferences.putString — key: ' + key + ', value: ' + (value || '(null)').substring(0, 200))
        return this.putString(key, value)
      }
    } catch (e2) {
      console.log('[Storage] SharedPreferences hook failed: ' + e2)
    }
  }

  // ── 2. SharedPreferences — putInt / putBoolean / putLong ─────────────────
  try {
    var EditorImpl = Java.use('android.app.SharedPreferencesImpl$EditorImpl')
    EditorImpl.putInt.implementation = function (key, value) {
      console.log('[Storage] SharedPreferences.putInt — key: ' + key + ', value: ' + value)
      return this.putInt(key, value)
    }
    EditorImpl.putBoolean.implementation = function (key, value) {
      console.log('[Storage] SharedPreferences.putBoolean — key: ' + key + ', value: ' + value)
      return this.putBoolean(key, value)
    }
    EditorImpl.putLong.implementation = function (key, value) {
      console.log('[Storage] SharedPreferences.putLong — key: ' + key + ', value: ' + value)
      return this.putLong(key, value)
    }
  } catch (e) {
    console.log('[Storage] SharedPreferences putInt/putBoolean/putLong hook failed: ' + e)
  }

  // ── 3. FileOutputStream — constructor, log file path ─────────────────────
  try {
    var FileOutputStream = Java.use('java.io.FileOutputStream')
    FileOutputStream.$init.overload('java.io.File').implementation = function (file) {
      var path = file !== null ? file.getAbsolutePath() : '(null)'
      console.log('[Storage] FileOutputStream opened — path: ' + path)
      return this.$init(file)
    }
    FileOutputStream.$init.overload('java.lang.String').implementation = function (path) {
      console.log('[Storage] FileOutputStream opened — path: ' + path)
      return this.$init(path)
    }
  } catch (e) {
    console.log('[Storage] FileOutputStream hook failed: ' + e)
  }

  // ── 4. FileOutputStream.write — log content snippet ──────────────────────
  try {
    var FileOutputStream2 = Java.use('java.io.FileOutputStream')
    FileOutputStream2.write.overload('[B').implementation = function (bytes) {
      var snippet = ''
      try {
        snippet = Java.use('java.lang.String').$new(bytes, 'UTF-8').substring(0, 100)
      } catch (e) { snippet = '(binary)' }
      console.log('[Storage] FileOutputStream.write — snippet: ' + snippet)
      return this.write(bytes)
    }
  } catch (e) {
    console.log('[Storage] FileOutputStream.write hook failed: ' + e)
  }

  // ── 5. SQLiteDatabase — execSQL ───────────────────────────────────────────
  try {
    var SQLiteDatabase = Java.use('android.database.sqlite.SQLiteDatabase')
    SQLiteDatabase.execSQL.overload('java.lang.String').implementation = function (sql) {
      console.log('[Storage] SQLiteDatabase.execSQL — sql: ' + String(sql).substring(0, 500))
      return this.execSQL(sql)
    }
    SQLiteDatabase.execSQL.overload('java.lang.String', '[Ljava.lang.Object;').implementation = function (sql, bindArgs) {
      console.log('[Storage] SQLiteDatabase.execSQL (bound) — sql: ' + String(sql).substring(0, 500))
      return this.execSQL(sql, bindArgs)
    }
  } catch (e) {
    console.log('[Storage] SQLiteDatabase.execSQL hook failed: ' + e)
  }

  // ── 6. SQLiteDatabase — rawQuery ──────────────────────────────────────────
  try {
    var SQLiteDatabase2 = Java.use('android.database.sqlite.SQLiteDatabase')
    SQLiteDatabase2.rawQuery.overload('java.lang.String', '[Ljava.lang.String;').implementation = function (sql, selectionArgs) {
      console.log('[Storage] SQLiteDatabase.rawQuery — sql: ' + String(sql).substring(0, 500))
      return this.rawQuery(sql, selectionArgs)
    }
  } catch (e) {
    console.log('[Storage] SQLiteDatabase.rawQuery hook failed: ' + e)
  }

  console.log('[Storage] All storage hooks installed')
})
