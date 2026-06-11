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
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")

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
