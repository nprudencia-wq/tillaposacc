import type { CapacitorConfig } from "@capacitor/cli";

// The app loads the live site so PIN sign-in and other server features keep working;
// the service worker still provides offline use after the first online launch.
const config: CapacitorConfig = {
  appId: "com.tillapos.app",
  appName: "Tilla POS",
  webDir: ".output/public",
  server: { url: "https://tillapos.com", cleartext: false },
};

export default config;
