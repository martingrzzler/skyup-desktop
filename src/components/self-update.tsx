import { useEffect, useRef, useState } from "react";
import { Text } from "./text";
import { Update } from "@tauri-apps/plugin-updater";
import { Progress } from "./progress";
import { relaunch } from "@tauri-apps/plugin-process";
import { text } from "../lib/lang";

export function SelfUpdate({
  update,
  lang,
}: {
  update: Update;
  lang: keyof typeof text;
}) {
  const [progress, setProgress] = useState(0);
  const downloadedRef = useRef(0);
  const contentLengthRef = useRef(0);
  useEffect(() => {
    (async () => {
      await update.downloadAndInstall(async (event) => {
        switch (event.event) {
          case "Started":
            contentLengthRef.current = event.data.contentLength!;
            console.log(
              `started downloading ${event.data.contentLength} bytes`
            );
            break;
          case "Progress":
            downloadedRef.current += event.data.chunkLength;
            setProgress(
              Math.round(
                (downloadedRef.current / contentLengthRef.current) * 100
              )
            );
            console.log(
              `downloaded ${downloadedRef.current} from ${contentLengthRef.current}`
            );
            break;
          case "Finished":
            console.log("download finished");
            break;
        }
      });
      await relaunch();
    })();
  }, []);
  return (
    <>
      <input
        type="checkbox"
        defaultChecked={true}
        id="my_modal_6"
        className="modal-toggle"
      />
      <div className="modal" role="dialog">
        <div className="modal-box">
          <h3 className="text-lg font-bold">Update</h3>
          <Text>{text[lang].selfUpdate}</Text>
          <Progress value={progress} />
        </div>
      </div>
    </>
  );
}
