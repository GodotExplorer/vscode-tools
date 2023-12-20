import * as path from "path";
import * as vscode from "vscode";
import { attemptSettingsUpdate } from "./utils";
import {
	GDInlayHintsProvider,
	GDHoverProvider,
	GDDocumentLinkProvider,
	GDSemanticTokensProvider,
	GDCompletionItemProvider,
	GDDocumentationProvider,
	GDDefinitionProvider,
	GDTaskProvider,
} from "./providers";
import { ClientConnectionManager } from "./lsp";
import { ScenePreviewProvider } from "./scene_tools";
import { GodotDebugger } from "./debugger";
import { FormattingProvider } from "./formatter";
import { exec, execSync } from "child_process";
import {
	get_configuration,
	find_file,
	find_project_file,
	register_command,
	get_project_version,
	set_context,
	projectDir,
	projectVersion,
	verify_godot_version,
} from "./utils";
import { prompt_for_godot_executable } from "./utils/prompts";

interface Extension {
	context?: vscode.ExtensionContext;
	lsp?: ClientConnectionManager;
	debug?: GodotDebugger;
	scenePreviewProvider?: ScenePreviewProvider;
	linkProvider?: GDDocumentLinkProvider;
	hoverProvider?: GDHoverProvider;
	inlayProvider?: GDInlayHintsProvider;
	formattingProvider?: FormattingProvider;
	docsProvider?: GDDocumentationProvider;
	definitionProvider?: GDDefinitionProvider;
	semanticTokensProvider?: GDSemanticTokensProvider;
	completionProvider?: GDCompletionItemProvider;
	tasksProvider?: GDTaskProvider;
}

export const globals: Extension = {};

export function activate(context: vscode.ExtensionContext) {
	attemptSettingsUpdate(context);

	globals.context = context;
	globals.lsp = new ClientConnectionManager(context);
	globals.debug = new GodotDebugger(context);
	globals.scenePreviewProvider = new ScenePreviewProvider(context);
	globals.linkProvider = new GDDocumentLinkProvider(context);
	globals.hoverProvider = new GDHoverProvider(context);
	globals.inlayProvider = new GDInlayHintsProvider(context);
	globals.formattingProvider = new FormattingProvider(context);
	globals.docsProvider = new GDDocumentationProvider(context);
	globals.definitionProvider = new GDDefinitionProvider(context);
	// globals.semanticTokensProvider = new GDSemanticTokensProvider(context);
	// globals.completionProvider = new GDCompletionItemProvider(context);
	// globals.tasksProvider = new GDTaskProvider(context);

	context.subscriptions.push(
		register_command("openEditor", open_workspace_with_editor),
		register_command("copyResourcePath", copy_resource_path),
		register_command("listGodotClasses", list_classes),
		register_command("switchSceneScript", switch_scene_script),
	);

	set_context("godotFiles", ["gdscript", "gdscene", "gdresource", "gdshader",]);
	set_context("sceneLikeFiles", ["gdscript", "gdscene"]);

	get_project_version().then(() => {
		const settingName = `editorPath.godot${projectVersion[0]}`;
		const godotPath = get_configuration(settingName);
		const result = verify_godot_version(godotPath, projectVersion[0]);

		switch (result.status) {
			case "SUCCESS": {
				break;
			}
			case "WRONG_VERSION": {
				const message = `The specified Godot executable, '${godotPath}' is the wrong version. 
				The current project uses Godot v${projectVersion}, but the specified executable is Godot v${result.version}.
				Extension features will not work correctly unless this is fixed.`;
				prompt_for_godot_executable(message, settingName);
				break;
			}
			case "INVALID_EXE": {
				const message = `The specified Godot executable, '${godotPath}' is invalid. 
				Extension features will not work correctly unless this is fixed.`;
				prompt_for_godot_executable(message, settingName);
				break;
			}
		}
	});
}

export function deactivate(): Thenable<void> {
	return new Promise<void>((resolve, reject) => {
		globals.lsp.client.stop();
		resolve();
	});
}

function copy_resource_path(uri: vscode.Uri) {
	if (!uri) {
		uri = vscode.window.activeTextEditor.document.uri;
	}

	const project_dir = path.dirname(find_project_file(uri.fsPath));
	if (project_dir === null) {
		return;
	}

	let relative_path = path.normalize(path.relative(project_dir, uri.fsPath));
	relative_path = relative_path.split(path.sep).join(path.posix.sep);
	relative_path = "res://" + relative_path;

	vscode.env.clipboard.writeText(relative_path);
}

async function list_classes() {
	await globals.lsp.client.list_classes();
}

async function switch_scene_script() {
	let path = vscode.window.activeTextEditor.document.uri.fsPath;

	if (path.endsWith(".tscn")) {
		path = path.replace(".tscn", ".gd");
	} else if (path.endsWith(".gd")) {
		path = path.replace(".gd", ".tscn");
	}

	const file = await find_file(path);
	if (file) {
		vscode.window.showTextDocument(file);
	}
}

function open_workspace_with_editor() {
	const settingName = `editorPath.godot${projectVersion[0]}`;
	const godotPath = get_configuration(settingName);

	const result = verify_godot_version(godotPath, projectVersion[0]);

	switch (result.status) {
		case "SUCCESS": {
			exec(`${godotPath} --path "${projectDir}" -e`);
			break;
		}
		case "WRONG_VERSION": {
			const message = `Cannot launch Godot editor: The current project uses Godot v${projectVersion}, but the specified Godot executable is version ${result.version}`;
			prompt_for_godot_executable(message, settingName);
			break;
		}
		case "INVALID_EXE": {
			const message = `Cannot launch Godot editor: '${settingName}' value of '${godotPath}' is not a valid Godot executable`;
			prompt_for_godot_executable(message, settingName);
			break;
		}
	}
}
