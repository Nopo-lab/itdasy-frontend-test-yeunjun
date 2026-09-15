# Mobile runtime evidence — 2026-09-16

- Android: Galaxy emulator, package `com.y2do.itdasy`, debug APK built with Java 21 and installed.
- Android real staging flow: native launch → demo login → required-only privacy choice → Instagram setup skip → home → customer list → synthetic customer detail → booking form → create 09:00 booking.
- Android rotated to `2340×1080`; the weekly booking calendar, date controls, Today button, and add button remained visible without overlap.
- Cleanup: the single synthetic booking created in the preceding 30 minutes was deleted through the authenticated staging API and a follow-up read confirmed absence.
- iOS: iPhone 17 simulator, bundle `com.nopolab.itdasy`, Xcode simulator build/install/launch succeeded.
- iOS real staging flow: native launch → demo login → required-only privacy choice → Instagram setup skip → home → customer list → synthetic customer detail → booking form → create 09:00 booking.
- Cleanup: the single synthetic iOS booking was deleted through the authenticated staging API and a follow-up read confirmed today's count returned to zero.
- iPhone initially rejected landscape because the native app declared portrait only. FE PR #52 added both landscape directions and a regression check.
- Rebuilt candidate rotated from `402×874` to `874×402`; Home, Workspace, My Shop, and AI assistant navigation remained visible. In landscape, My Shop → Customer Management also opened and showed add/search/customer controls. Portrait was restored successfully.

No real customer record or customer message was changed. Both synthetic bookings were removed.

Evidence images: `android-home.png`, `android-booking-save.png`, `android-landscape.png`,
`ios-booking-save.png`, and `ios-landscape-fixed.png` in this directory.
