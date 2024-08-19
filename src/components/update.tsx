import { useEffect, useRef, useState } from "react";
import { text } from "../lib/lang";

import { invoke } from "@tauri-apps/api/core";
import { check, Update as SelfUpdateInfo } from "@tauri-apps/plugin-updater";
import { SelfUpdate } from "./self-update";
import { Progress } from "./progress";
import { Text } from "./text";

type BackendResponse<T> = {
  error?: string;
  result?: T;
};

type DeviceInfo = {
  deviceName: string;
  softwareVersion: string;
};

type UpdateProgress = {
  url: string;
  totalBytes: number;
  downloaded: number;
  currentFile: string;
  totalFiles: number;
  processedFiles: number;
};

const ESSENTIALS_URL =
  "https://www.skytraxx.org/skytraxx5mini/skytraxx5mini-essentials.tar";
const SYSTEM_URL =
  "https://www.skytraxx.org/skytraxx5mini/skytraxx5mini-system.tar";

export default function Update({ lang }: { lang: keyof typeof text }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [update, setUpdate] = useState<SelfUpdateInfo | null>(null);
  const [updateProgress, setUpdateProgress] = useState({
    essentialsDownload: 0,
    essentialsInstalling: 0,
    essentialsCurrentFile: "",
    systemDownload: 0,
    systemInstalling: 0,
    systemCurrentFile: "",
  });
  const essentialsDownloadedRef = useRef(0);

  useEffect(() => {
    (async () => {
      const update = await check();
      setUpdate(update);
    })();
  }, []);

  async function fetchWithProgress() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().listen(
      "UPDATE_PROGRESS",
      ({ payload }: { payload: UpdateProgress }) => {
        console.log("UPDATE_PROGRESS", payload);
        const downloadPercentage = Math.round(
          (payload.downloaded / payload.totalBytes) * 100
        );
        const installPercentage = Math.round(
          (payload.processedFiles / payload.totalFiles) * 100
        );

        switch (payload.url) {
          case ESSENTIALS_URL:
            essentialsDownloadedRef.current = payload.downloaded;
            setUpdateProgress((prev) => ({
              ...prev,
              essentialsDownload: downloadPercentage,
              essentialsInstalling: installPercentage || 0,
              essentialsCurrentFile: payload.currentFile,
            }));
            break;

          case SYSTEM_URL:
            setUpdateProgress((prev) => ({
              ...prev,
              systemDownload: downloadPercentage,
              systemInstalling: installPercentage || 0,
              systemCurrentFile: payload.currentFile,
            }));
            break;
          default:
            throw new Error("Unknown URL: " + payload.url);
        }
      }
    );

    const timeout = new Promise(async (resolve) => {
      await new Promise((innerResolve) => {
        const interval = setInterval(() => {
          if (essentialsDownloadedRef.current > 0) {
            clearInterval(interval);
            innerResolve(true);
          }
        }, 50);
      });
      console.log("Download started");

      setTimeout(async () => {
        // if the internet connection is fast enough (100 KB/s) we can also download the system files
        if (essentialsDownloadedRef.current >= 204800) {
          console.log("Downloading system files");
          await invoke("download_and_update_cmd", { url: SYSTEM_URL });
          resolve(true);
          return;
        }
        console.log("Not downloading system files");
        resolve(false);
      }, 2000);
    });

    await invoke("download_and_update_cmd", {
      url: ESSENTIALS_URL,
    });

    console.log("Waiting for timeout");
    await timeout;
  }

  async function success(msg: string) {
    setSuccessMessage(msg);
    setLoading(false);
  }

  function failed(msg: string, err?: any) {
    console.log("[ERROR]", err);
    setError(msg);
    setLoading(false);
  }

  return (
    <>
      {update?.available ? <SelfUpdate lang={lang} update={update} /> : null}
      <div className=" h-full flex flex-col sm:p-20 p-8">
        <h1 className="text-2xl mb-10 font-skytraxx text-center">Skytraxx</h1>
        {error && (
          <Text ringColor="red" className="mb-4 self-center">
            {error}
          </Text>
        )}
        <div className="flex flex-col gap-4">
          {!!updateProgress.essentialsDownload ? (
            <>
              <Progress
                label={text[lang].downloadEssentials}
                value={updateProgress.essentialsDownload}
              />
              <Progress
                label={`${text[lang].updateEssentials}    ${
                  updateProgress.essentialsInstalling !== 100
                    ? updateProgress.essentialsCurrentFile
                    : ""
                }`}
                value={updateProgress.essentialsInstalling}
              />
            </>
          ) : null}
          {!!updateProgress.systemDownload ? (
            <>
              <Progress
                label={text[lang].downloadSystem}
                value={updateProgress.systemDownload}
              />
              <Progress
                label={`${text[lang].updateSystem}     ${
                  updateProgress.systemInstalling !== 100
                    ? updateProgress.systemCurrentFile
                    : ""
                }`}
                value={updateProgress.systemInstalling}
              />
            </>
          ) : null}
        </div>
        {!!successMessage ? (
          <Text className="self-center" ringColor="green">
            {successMessage}
          </Text>
        ) : (
          <div className="flex items-center justify-center mt-10">
            <button
              className={"btn-lg btn sm:btn btn-wide"}
              onClick={async () => {
                setError(null);
                setLoading(true);
                setUpdateProgress({
                  essentialsDownload: 0,
                  essentialsInstalling: 0,
                  essentialsCurrentFile: "",
                  systemDownload: 0,
                  systemInstalling: 0,
                  systemCurrentFile: "",
                });
                setSuccessMessage(null);

                const deviceInfoRes = (await invoke(
                  "get_skytraxx_device_cmd"
                )) as BackendResponse<DeviceInfo>;
                if (deviceInfoRes.error) {
                  return failed(text[lang].deviceNotFound, deviceInfoRes.error);
                }

                if (deviceInfoRes.result?.deviceName !== "5mini") {
                  return failed(text[lang].only5Mini);
                }

                try {
                  const crash_report = invoke("send_crash_report_cmd");
                  await fetchWithProgress();
                  await crash_report;
                } catch (error) {
                  return failed(text[lang].updateError, error);
                }

                success(text[lang].success);
              }}
              disabled={loading}
            >
              {loading && <span className="loading loading-spinner"></span>}
              {text[lang].update}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
