import * as vscode from 'vscode';
import { ImageEditorProvider } from './imageEditor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(ImageEditorProvider.register(context));
}
