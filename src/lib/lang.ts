import { locale } from "@tauri-apps/plugin-os";

export async function getLanguage(): Promise<keyof typeof text> {
  const code = await locale();

  if (code?.toLowerCase().startsWith("de")) {
    return "de";
  }

  return "en";
}

export const text = {
  en: {
    downloadEssentials: "Download essential files",
    downloadSystem: "Download system files",
    downloadAppInstaller: "Download SkyUp Installer",
    updateEssentials: "Update essential files",
    updateSystem: "Update system files",
    updateAppInstaller: "Update SkyUp Installer",
    deviceNotFound: "Skytraxx Vario not found. Is it connected?",
    unsupportedDevice:
      "Device not supported. Only Skytraxx 5 or 5 Mini devices can be updated at the moment.",
    updateError:
      "Error updating. Are you connected to the internet? Is the Skytraxx Vario connected?",
    success:
      "Your vario has been successfully updated! You can close the app now. Afterwards, eject the drive!",
    update: "Update Vario",
    selfUpdate: "Updating SkyUp...",
  },
  de: {
    downloadEssentials: "Download essentieller Dateien",
    downloadSystem: "Download System Dateien",
    downloadAppInstaller: "Download SkyUp Installer",
    updateEssentials: "Essentielle Dateien aktualisieren",
    updateSystem: "System Dateien aktualisieren",
    updateAppInstaller: "Aktualisiere SkyUp Installer",
    deviceNotFound:
      "Skytraxx Vario konnte nicht gefunden werden. Ist es angeschlossen?",
    unsupportedDevice:
      "Das Gerät wird nicht unterstützt. Nur Skytraxx 5 oder 5 Mini Geräte können derzeit aktualisiert werden.",
    updateError:
      "Fehler beim Aktualisieren. Bist du mit dem Internet verbunden? Ist das Skytraxx Vario angeschlossen?",
    success:
      "Dein Vario wurde erfolgreich aktualisiert! Du kannst die App jetzt schließen. Danach das Laufwerk auswerfen!",
    update: "Vario aktualisieren",
    selfUpdate: "SkyUp wird aktualisiert...",
  },
};
