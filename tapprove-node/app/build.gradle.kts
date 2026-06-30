plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.tapprove.node"
    compileSdk = 34

    defaultConfig {
        applicationId = "io.tapprove.node"
        minSdk = 26          // Android 8.0
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    // Build flavours pick the target environment at build time. Pick
    // the active variant in Android Studio → View → Tool Windows →
    // Build Variants (e.g. stagingDebug, productionDebug). The
    // BuildConfig.{API_BASE_URL, APP_BASE_URL, WS_BASE_URL} constants
    // generated below are the single source of truth — every Kotlin
    // call site reads from them, no URL literals scattered through
    // the source.
    //
    // The staging flavour suffixes applicationId so a staging APK
    // installs alongside production on the same device (package id
    // becomes io.tapprove.node.staging) and Settings → About reports
    // the version as "1.0.0-staging". App Links verification keys on
    // the package name, so staging will NOT auto-handle tapprove.io
    // intents — fine, since staging emits staging.tapprove.io URLs
    // anyway.
    flavorDimensions += "environment"

    productFlavors {
        create("production") {
            dimension = "environment"
            buildConfigField("String", "API_BASE_URL", "\"https://api.tapprove.io\"")
            buildConfigField("String", "APP_BASE_URL", "\"https://tapprove.io\"")
            buildConfigField("String", "WS_BASE_URL",  "\"wss://api.tapprove.io\"")
        }
        create("staging") {
            dimension = "environment"
            applicationIdSuffix = ".staging"
            versionNameSuffix   = "-staging"
            buildConfigField("String", "API_BASE_URL", "\"https://staging-api.tapprove.io\"")
            buildConfigField("String", "APP_BASE_URL", "\"https://staging.tapprove.io\"")
            buildConfigField("String", "WS_BASE_URL",  "\"wss://staging-api.tapprove.io\"")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        viewBinding = true
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.4")
    // LifecycleService — lets the foreground MonitorService own a Lifecycle so
    // CameraX (ProcessCameraProvider.bindToLifecycle) and lifecycle-aware
    // sensing run independent of any Activity (survives screen-off / Doze).
    implementation("androidx.lifecycle:lifecycle-service:2.8.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

    // EncryptedSharedPreferences (Keystore-backed) for the per-business
    // BLE salt. Used only by Prefs.encryptedSp — the rest of Prefs stays
    // on plain SharedPreferences since those settings are operator-visible
    // anyway.
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // CameraX
    val cameraX = "1.3.4"
    implementation("androidx.camera:camera-core:$cameraX")
    implementation("androidx.camera:camera-camera2:$cameraX")
    implementation("androidx.camera:camera-lifecycle:$cameraX")
    implementation("androidx.camera:camera-view:$cameraX")

    // ML Kit on-device object detection & tracking (gives stable tracking IDs).
    implementation("com.google.mlkit:object-detection:17.0.2")

    // ML Kit on-device face detection — display-only privacy masking.
    // Face boxes are never stored, uploaded, or used for counting.
    implementation("com.google.mlkit:face-detection:16.1.7")

    // Animated-GIF support for the loyalty-greeting display overlay.
    implementation("pl.droidsonroids.gif:android-gif-drawable:1.2.28")

    // QR code generation for the stranger-display app-download CTA.
    implementation("com.google.zxing:core:3.5.2")

    // WorkManager — schedules the daily GIF cache refresh that runs even
    // when the kiosk has been on without restart for >24 hours.
    implementation("androidx.work:work-runtime-ktx:2.9.1")

    // OkHttp — WebSocket client for real-time loyalty display commands.
    // Standard pick on Android; same library backs Retrofit if we ever
    // pull it in. The Uploader still uses plain HttpURLConnection.
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
