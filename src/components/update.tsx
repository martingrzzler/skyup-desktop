import { useEffect, useRef, useState } from "react";
import { text } from "../lib/lang";

import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import classNames from "classnames";

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
const APP_URL = "https://www.skytraxx.org/skytraxx5mini/skytraxx5mini-app.tar";
const APPVERSION_URL =
  "https://www.skytraxx.org/skytraxx5mini/skytraxx5mini-app.ver";

export default function Update({ lang }: { lang: keyof typeof text }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [appUpdateAvailable, setAppUpdateAvailable] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({
    essentialsDownload: 0,
    essentialsInstalling: 0,
    essentialsCurrentFile: "",
    systemDownload: 0,
    systemInstalling: 0,
    systemCurrentFile: "",
    appDownload: 0,
    appInstalling: 0,
    appCurrentFile: "",
  });
  const essentialsDownloadedRef = useRef(0);

  async function checkForAppUpdate() {
    console.log("Checking version");
    const appVersion = await getVersion();
    const needsUpdate = (await invoke("check_for_app_update_cmd", {
      url: APPVERSION_URL,
      appVersion,
    })) as boolean;

    setAppUpdateAvailable(needsUpdate);
  }

  // check on mount
  useEffect(() => {
    checkForAppUpdate();
  }, []);

  async function fetchWithProgress() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().listen(
      "UPDATE_PROGRESS",
      ({ payload }: { payload: UpdateProgress }) => {
        // console.log("UPDATE_PROGRESS", payload);
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

          case APP_URL:
            setUpdateProgress((prev) => ({
              ...prev,
              appDownload: downloadPercentage,
              appInstalling: installPercentage || 0,
              appCurrentFile: payload.currentFile,
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
          if (appUpdateAvailable) {
            console.log("Downloading app update");
            await invoke("download_and_update_cmd", { url: APP_URL });
          }
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
        {!!updateProgress.appDownload ? (
          <>
            <Progress
              label={text[lang].downloadApp}
              value={updateProgress.appDownload}
            />
            <Progress
              label={`${text[lang].updateApp}     ${
                updateProgress.appInstalling !== 100
                  ? updateProgress.appCurrentFile
                  : ""
              }`}
              value={updateProgress.appInstalling}
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
                appDownload: 0,
                appInstalling: 0,
                appCurrentFile: "",
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
  );
}

function Progress({ label, value }: { label?: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <p className="">{label}</p>
        <p>{value}%</p>
      </div>
      <progress className="progress w-full" value={value} max={100} />
    </div>
  );
}

function Text({
  children,
  ringColor = "gray",
  className,
}: {
  children: string;
  ringColor: "red" | "green" | "gray";
  className?: string;
}) {
  return (
    <p
      className={classNames(
        "text-sm mt-4 rounded p-2 ring-1 ring-gray-300 max-w-fit",
        {
          "ring-red-300": ringColor === "red",
          "ring-gray-300": ringColor === "gray",
          "ring-green-300": ringColor === "green",
        },
        className
      )}
    >
      {children}
    </p>
  );
}
