# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ─────────────────────────────────────────────────────────────────────────────
# Lior release keep rules
#
# The release buildType runs R8 (minifyEnabled + shrinkResources, see
# build.gradle). The Capacitor bridge invokes @PluginMethod-annotated methods
# reflectively BY NAME, and several native components are referenced only from
# the JS layer or the Android manifest — so without explicit keeps R8 can rename
# or strip them. That failure appears ONLY in the signed release AAB (never in a
# debug build), and — with no crash reporting wired yet — would be invisible in
# production: haptics, the home-screen partner widget, and share-to-Lior would
# silently stop working. Keep the Capacitor runtime, every plugin, its bridge
# entry points, and all of our own native code.
# ─────────────────────────────────────────────────────────────────────────────

# Preserve source/line info so release stack traces (and the client_error_logs
# sink) stay readable.
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Capacitor core + bridge runtime
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }

# Every Capacitor plugin class and its reflectively-invoked bridge methods
-keep public class * extends com.getcapacitor.Plugin
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * {
  @com.getcapacitor.annotation.CapacitorPlugin *;
  @com.getcapacitor.annotation.PermissionCallback <methods>;
  @com.getcapacitor.annotation.ActivityCallback <methods>;
  @com.getcapacitor.PluginMethod public <methods>;
}
-keepclassmembers class * {
  @com.getcapacitor.PluginMethod <methods>;
}

# Our own native code — the three custom plugins (LiorHapticsPlugin,
# LiorWidgetPlugin, ShareTargetPlugin) and the manifest-registered
# PartnerWidgetProvider (AppWidgetProvider) are all under this package.
-keep class com.lior.app.** { *; }

# JS ↔ native @JavascriptInterface bridge methods on the WebView
-keepclassmembers class * {
  @android.webkit.JavascriptInterface <methods>;
}

# Standard Android component keeps (belt-and-braces; AGP usually adds these)
-keep public class * extends android.appwidget.AppWidgetProvider
-keep public class * extends android.content.BroadcastReceiver
