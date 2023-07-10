"use client";
import { Editor, loader } from "@monaco-editor/react";
import { VimMode, initVimMode } from "monaco-vim";
import { forwardRef, useEffect, useRef, useState } from "react";
import type * as monaco from "monaco-editor";
import { libSource } from "../editor-types";

loader.config({
  paths: {
    vs: "/vs",
  },
});

const DEFAULT_OPTIONS = {
  lineNumbers: "on",
  tabSize: 2,
  insertSpaces: false,
  minimap: {
    enabled: false,
  },
  fontSize: 16,
} as const satisfies monaco.editor.IStandaloneEditorConstructionOptions;

type TsErrors = [
  SemanticDiagnostics: monaco.languages.typescript.Diagnostic[],
  SyntacticDiagnostics: monaco.languages.typescript.Diagnostic[],
  SuggestionDiagnostics: monaco.languages.typescript.Diagnostic[],
  CompilerOptionsDiagnostics: monaco.languages.typescript.Diagnostic[]
];

const libCache = new Set<string>();

const LIB_URI = "ts:filename/checking.d.ts";
export default function App() {
  const [code, setCode] = useState("");
  const modelRef = useRef<any>();
  const [initialTypecheckDone, setInitialTypecheckDone] = useState(false);
  const [editorState, setEditorState] =
    useState<monaco.editor.IStandaloneCodeEditor>();
  const [tsErrors, setTsErrors] = useState<TsErrors>([[], [], [], []]);

  const onMount =
    (value: string, onError: (v: TsErrors) => void) =>
    async (
      editor: monaco.editor.IStandaloneCodeEditor,
      monaco: typeof import("monaco-editor")
    ) => {
      const lineWithUserCode = -100;

      // once you register a lib you cant unregister it (idk how to unregister it)
      // so when editor mounts again it tries to add the lib again and throws an error
      if (!libCache.has(libSource)) {
        monaco.languages.typescript.javascriptDefaults.addExtraLib(
          libSource,
          LIB_URI
        );
        monaco.editor.createModel(
          libSource,
          "typescript",
          monaco.Uri.parse(LIB_URI)
        );
        libCache.add(libSource);
      }

      const model = editor.getModel();

      if (!model) {
        throw new Error();
      }

      modelRef.current = model;
      setEditorState(editor);

      const ts = await (
        await monaco.languages.typescript.getTypeScriptWorker()
      )(model.uri);

      const filename = model.uri.toString();

      // what actually runs when checking errors
      const typeCheck = async () => {
        const errors = await Promise.all([
          ts.getSemanticDiagnostics(filename),
          ts.getSyntacticDiagnostics(filename),
          ts.getSuggestionDiagnostics(filename),
          ts.getCompilerOptionsDiagnostics(filename),
        ] as const);

        onError(errors);
      };

      // TODO: we prolly should use this for blocking ranges as it might not be as janky
      // https://github.com/Pranomvignesh/constrained-editor-plugin
      model.onDidChangeContent((e) => {
        // in monaco editor, the first line is e1e1e
        // do net let them type if they are editing before lineWithUserCode
        if (
          e.changes.some((c) => c.range.startLineNumber <= lineWithUserCode + 1)
        ) {
          editor.trigger("someIdString", "undo", null);
        }

        typeCheck().catch(console.error);
      });

      await typeCheck();
      setInitialTypecheckDone(true);

      // monaco.languages.registerInlayHintsProvider(
      //   "typescript",
      //   createTwoslashInlayProvider(monaco, ts)
      // );
    };

  return (
    <>
      <Editor
        theme="vs-dark"
        className="h-full flex-1"
        options={DEFAULT_OPTIONS}
        // @ts-ignore
        onMount={onMount("", setTsErrors)}
        value={code}
        onChange={(code) => setCode(code ?? "")}
      />
      {editorState && <VimStatusBar editor={editorState} />}
    </>
  );
}
const VimStatusBar = forwardRef<
  HTMLDivElement,
  { editor: monaco.editor.IStandaloneCodeEditor }
>(function VimStatusBar({ editor }, _) {
  const statusBarRef = useRef<HTMLDivElement | null>(null);
  const vimModeRef = useRef<VimMode>();
  const settings = { bindings: "vim" };

	useEffect(() => {
		if (settings.bindings === "vim") {
			if (!vimModeRef.current) {
				vimModeRef.current = initVimMode(editor, statusBarRef.current);
			}
		} else {
			vimModeRef.current?.dispose();
			vimModeRef.current = undefined;
			if (statusBarRef.current) {
				statusBarRef.current.textContent = "";
			}
		}
	}, [editor, settings.bindings])

  return (
    <div className="flex w-full">
      <div ref={statusBarRef} className="font-mono" />
    </div>
  );
});
