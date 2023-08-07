import { SceneTreeProvider } from "./scene_tree_provider";
import path = require("path");
import { createLogger } from "../logger";

const log = createLogger("debugger.runtime");

export interface GodotBreakpoint {
	file: string;
	id: number;
	line: number;
}

export interface GodotStackFrame {
	file: string;
	function: string;
	id: number;
	line: number;
}

export interface GodotVariable {
	name: string;
	scope_path?: string;
	sub_values?: GodotVariable[];
	value: any;
}

export interface GDObject {
	stringify_value(): string;
	sub_values(): GodotVariable[];
	type_name(): string;
}

export class RawObject extends Map<any, any> {
	constructor(public class_name: string) {
		super();
	}
}

export class ObjectId implements GDObject {
	constructor(public id: bigint) {}

	public stringify_value(): string {
		return `<${this.id}>`;
	}

	public sub_values(): GodotVariable[] {
		return [{ name: "id", value: this.id }];
	}

	public type_name(): string {
		return "Object";
	}
}

export class GodotDebugData {
	private breakpoint_id = 0;
	private breakpoints: Map<string, GodotBreakpoint[]> = new Map();

	public last_frame: GodotStackFrame;
	public last_frames: GodotStackFrame[] = [];
	public project_path: string;
	public scene_tree?: SceneTreeProvider;
	public stack_count: number = 0;
	public stack_files: string[] = [];
	public session;

	public constructor(session) {
		this.session = session;
	}

	public get_all_breakpoints(): GodotBreakpoint[] {
		const output: GodotBreakpoint[] = [];
		Array.from(this.breakpoints.values()).forEach((bp_array) => {
			output.push(...bp_array);
		});
		return output;
	}

	public get_breakpoints(path: string) {
		return this.breakpoints.get(path) || [];
	}

	public remove_breakpoint(path_to: string, line: number) {
		log.info("remove_breakpoint");
		const bps = this.breakpoints.get(path_to);

		if (bps) {
			const index = bps.findIndex((bp) => {
				return bp.line === line;
			});
			if (index !== -1) {
				const bp = bps[index];
				bps.splice(index, 1);
				this.breakpoints.set(path_to, bps);
				const file = `res://${path.relative(this.project_path, bp.file)}`;
				this.session?.controller.remove_breakpoint(
					file.replace(/\\/g, "/"),
					bp.line,
				);
			}
		}
	}

	public set_breakpoint(path_to: string, line: number) {
		log.info("set_breakpoint");
		const bp = {
			file: path_to.replace(/\\/g, "/"),
			line: line,
			id: this.breakpoint_id++,
		};

		let bps: GodotBreakpoint[] = this.breakpoints.get(bp.file);
		if (!bps) {
			bps = [];
			this.breakpoints.set(bp.file, bps);
		}

		bps.push(bp);

		if (this.project_path) {
			const out_file = `res://${path.relative(this.project_path, bp.file)}`;
			this.session?.controller.set_breakpoint(out_file.replace(/\\/g, "/"), line);
		}
	}
}
