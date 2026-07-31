import type { CDPSession } from "../cdp/session.js";
export interface KeyboardPressOptions {
    timeout?: number;
}
export interface KeyboardTypeOptions {
    delay?: number;
    timeout?: number;
}
export interface MouseButtonOptions {
    button?: "left" | "middle" | "right";
    clickCount?: number;
    timeout?: number;
}
export interface MouseMoveOptions {
    steps?: number;
    timeout?: number;
}
export interface MouseWheelOptions {
    timeout?: number;
}
/** Low-level keyboard input, useful when no locator is available. */
export declare class Keyboard {
    private readonly session;
    constructor(session: CDPSession);
    down(key: string, options?: KeyboardPressOptions): Promise<void>;
    up(key: string, options?: KeyboardPressOptions): Promise<void>;
    press(key: string, options?: KeyboardPressOptions): Promise<void>;
    type(text: string, options?: KeyboardTypeOptions): Promise<void>;
    insertText(text: string, options?: KeyboardPressOptions): Promise<void>;
}
/** Low-level mouse input in CSS viewport coordinates. */
export declare class Mouse {
    private readonly session;
    private x;
    private y;
    constructor(session: CDPSession);
    move(x: number, y: number, options?: MouseMoveOptions): Promise<void>;
    down(options?: MouseButtonOptions): Promise<void>;
    up(options?: MouseButtonOptions): Promise<void>;
    click(x: number, y: number, options?: MouseButtonOptions & MouseMoveOptions): Promise<void>;
    wheel(deltaX: number, deltaY: number, options?: MouseWheelOptions): Promise<void>;
}
