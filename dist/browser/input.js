/** Low-level keyboard input, useful when no locator is available. */
export class Keyboard {
    session;
    constructor(session) {
        this.session = session;
    }
    async down(key, options = {}) {
        await this.session.send("Input.dispatchKeyEvent", {
            type: "keyDown",
            ...keySpec(key),
        }, options.timeout);
    }
    async up(key, options = {}) {
        await this.session.send("Input.dispatchKeyEvent", {
            type: "keyUp",
            ...keySpec(key),
        }, options.timeout);
    }
    async press(key, options = {}) {
        await this.down(key, options);
        await this.up(key, options);
    }
    async type(text, options = {}) {
        for (const char of text) {
            await this.session.send("Input.dispatchKeyEvent", {
                type: "char",
                text: char,
                unmodifiedText: char,
            }, options.timeout);
            if (options.delay)
                await new Promise((resolve) => setTimeout(resolve, options.delay));
        }
    }
    async insertText(text, options = {}) {
        await this.session.send("Input.insertText", { text }, options.timeout);
    }
}
/** Low-level mouse input in CSS viewport coordinates. */
export class Mouse {
    session;
    x = 0;
    y = 0;
    constructor(session) {
        this.session = session;
    }
    async move(x, y, options = {}) {
        const steps = Math.max(1, Math.floor(options.steps ?? 1));
        const startX = this.x;
        const startY = this.y;
        for (let i = 1; i <= steps; i++) {
            const nextX = startX + (x - startX) * i / steps;
            const nextY = startY + (y - startY) * i / steps;
            await this.session.send("Input.dispatchMouseEvent", {
                type: "mouseMoved",
                x: nextX,
                y: nextY,
            }, options.timeout);
        }
        this.x = x;
        this.y = y;
    }
    async down(options = {}) {
        await this.session.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x: this.x,
            y: this.y,
            button: options.button ?? "left",
            clickCount: options.clickCount ?? 1,
        }, options.timeout);
    }
    async up(options = {}) {
        await this.session.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x: this.x,
            y: this.y,
            button: options.button ?? "left",
            clickCount: options.clickCount ?? 1,
        }, options.timeout);
    }
    async click(x, y, options = {}) {
        await this.move(x, y, options);
        const count = Math.max(1, Math.floor(options.clickCount ?? 1));
        for (let i = 0; i < count; i++) {
            await this.down({ ...options, clickCount: i + 1 });
            await this.up({ ...options, clickCount: i + 1 });
        }
    }
}
function keySpec(key) {
    const named = {
        Enter: ["Enter", "Enter", 13],
        Tab: ["Tab", "Tab", 9],
        Escape: ["Escape", "Escape", 27],
        Backspace: ["Backspace", "Backspace", 8],
        ArrowUp: ["ArrowUp", "ArrowUp", 38],
        ArrowDown: ["ArrowDown", "ArrowDown", 40],
        ArrowLeft: ["ArrowLeft", "ArrowLeft", 37],
        ArrowRight: ["ArrowRight", "ArrowRight", 39],
        Space: [" ", "Space", 32],
    };
    const [resolved, code, vk] = named[key] ?? (key.length === 1
        ? [key, `Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0)]
        : [key, key, 0]);
    return { key: resolved, code, windowsVirtualKeyCode: vk || undefined, nativeVirtualKeyCode: vk || undefined };
}
//# sourceMappingURL=input.js.map