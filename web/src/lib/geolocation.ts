/** Human-readable guidance for Geolocation API failures. */
export function describeGeoError(code?: number): string {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "Location only works on a secure (https://) address or on localhost. Open the site via its https link.";
  }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isMac = /Macintosh/.test(ua) && !/Mobile/.test(ua);
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  switch (code) {
    case 1: // PERMISSION_DENIED
      if (isIOS) return "Location is blocked. Open Settings → Privacy & Security → Location Services → Safari Websites (or your browser) and choose “While Using”, then reload.";
      if (isAndroid) return "Location is blocked. Tap the icon left of the address bar → Permissions → Location → Allow, and make sure phone Location is on.";
      if (isMac) return "Location is blocked. On your Mac open System Settings → Privacy & Security → Location Services, turn it on for your browser, then allow location for this site from the address-bar icon and reload.";
      return "Location is blocked. Allow location for this site from the icon in the address bar, then reload.";
    case 2: // POSITION_UNAVAILABLE
      return "Your device couldn’t determine its location. Check that Location / Wi-Fi is on, or search by city instead.";
    case 3: // TIMEOUT
      return "Finding your location took too long. Try again, or search by city instead.";
    default:
      return "Location isn’t available on this device. Search by city or PIN code instead.";
  }
}
