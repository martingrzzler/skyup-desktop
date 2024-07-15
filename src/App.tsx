import { useEffect, useState } from "react";
import "./App.css";
import Update from "./components/update";
import { getLanguage, text } from "./lib/lang";

function App() {
  const [lang, setLang] = useState<keyof typeof text | null>(null);

  useEffect(() => {
    getLanguage()
      .then((language) => {
        setLang(language);
      })
      .catch((error) => {
        console.error(error);
      });
  }, []);

  return (
    <main className="h-screen">{lang ? <Update lang={lang} /> : null}</main>
  );
}

export default App;
