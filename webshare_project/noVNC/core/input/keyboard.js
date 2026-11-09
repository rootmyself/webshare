/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC Authors
 * Licensed under MPL 2.0 or any later version (see LICENSE.txt)
 */

import * as Log from '../util/logging.js';
import { stopEvent } from '../util/events.js';
import * as KeyboardUtil from "./util.js";
import KeyTable from "./keysym.js";
import * as browser from "../util/browser.js";

//
// Keyboard event handler
//

// 키 제한 리스트 생성
const altType = (browser.isIOS() || browser.isMac()) ? 'Meta' : 'Alt' 

// 크롬 단축키
const COMB_KILL_PROC            = [ altType + 'Left', 'F4' ];
const COMB_KILL_TAB             = [ 'ControlLeft', 'KeyW' ];
const COMB_BACK_PAGE            = [ altType + 'Left', 'ArrowLeft' ];
const COMB_FRONT_PAGE           = [ altType + 'Left', 'ArrowRight' ];
const COMB_NEW_WIN              = [ 'ControlLeft', 'AltLeft', 'KeyN' ];
const COMB_NEW_WIN_SECRET_MODE  = [ 'ControlLeft', 'ShiftLeft', 'KeyN' ];
const COMB_NEW_TAB              = [ 'ControlLeft', 'KeyT' ];

// 나중에 더 필요한 경우 추가

const RESTRICT_LIST = [
    COMB_KILL_PROC, COMB_KILL_TAB,
    COMB_BACK_PAGE, COMB_FRONT_PAGE,
    COMB_NEW_WIN, COMB_NEW_WIN_SECRET_MODE,
    COMB_NEW_TAB
];

export default class Keyboard {
    constructor(target) {
        this._target = target || null;

        this._keyDownList = {};         // List of depressed keys
                                        // (even if they are happy)
        this._altGrArmed = false;       // Windows AltGr detection

        // keep these here so we can refer to them later
        this._eventHandlers = {
            'keyup': this._handleKeyUp.bind(this),
            'keydown': this._handleKeyDown.bind(this),
            'blur': this._allKeysUp.bind(this)
        };


        // ===== EVENT HANDLERS =====
        // urf.sendKey()
        this.onkeyevent = () => {}; // Handler for key press/release
    }

    // ===== PRIVATE METHODS =====
    _sendKeyEvent(keysym, code, down) {
        // IOS는 입력시 이 이벤트로 들어오지 않는다.
        //console.log(keysym, code, down);

        // push down 여부 검사를 위해서 입력받은 코드를 미리 받아놓는다.
        // code는 조건에 따라서 변화가 있을 수 있기 때문이다.
        let originCode = code;

        console.log(code);
        if (down) {
            // KeyList에 눌리고 있는 code를 담는다.
            this._keyDownList[code] = keysym;
        } else {
            // Do we really think this key is down?
            if (!(code in this._keyDownList)) {
                return;
            }
            delete this._keyDownList[code];

            // meta 키 떼었을때 다른 키들이 올바르게 떼어지지 않는 문제 
            // 해결을 위함
            if(code === "MetaLeft" || code === "MetaRight") {
                this._allKeysUp();
            }
        
        }

        // 한영키 통일을 위한 예외처리
        // If Key Event is Android or Mac Keyboard
        if(code === 'Lang1' || code === 'MetaRight' || code === 'AltRight') {
            keysym = 65329;
            code = 'AltRight';
        } 

        // MacOS 한글 활성화 되어 있는 경우
        // 한글을 보내면 이상하게 나오기 때문에
        // 영어로 매핑해서 보내준다.
        if(keysym > 16789800) {
            // code 이름에서 맨 마지막이 알파뱃이기 때문에
            // 해당 알파뱃의 아스키 코드를 가지고 온다.
            // keyA 'A' 
            keysym = code.charCodeAt(3);
        }

        // 영문 대문자를 소문자로 매핑해서 보내준다.
        // shift를 누른 상태에서는 대문자를 보내줘야 하기 때문에 
        if( this._keyDownList['ShiftLeft'] === undefined
            && 'A'.charCodeAt(0) <= keysym && keysym <= 'Z'.charCodeAt(0)) {
            keysym += 'a'.charCodeAt(0) - 'A'.charCodeAt(0);
        }
        
        if (down) {
            // check restrict key set 
            // before send key event 
            this.restrict_check()
                .then((message) => {
                    if (message === 'true') {

                        // 한번 눌린 키는 떼기 전까지 계속해서 보내준다.
                        // 단점 : (대문자 및 특수분자 입력을 제외한..)
                        //       shift나 ctrl을 사용하는 모든 기능을 쓸수 없다. 
                        if (this.push_check(originCode)) {
                            this.onkeyevent(keysym, code);
                        } else {
                            this.onkeyevent(keysym, code, down);
                        }

                    } else {
                        console.log("restrict!");
                    }
                });
        }

        Log.Debug("onkeyevent " + (down ? "down" : "up") +
                    ", keysym: " + keysym, ", code: " + code);
    }

    _getKeyCode(e) {
        const code = KeyboardUtil.getKeycode(e);
        if (code !== 'Unidentified') {
            return code;
        }

        // Unstable, but we don't have anything else to go on
        if (e.keyCode) {
            // 229 is used for composition events
            if (e.keyCode !== 229) {
                return 'Platform' + e.keyCode;
            }
        }

        // A precursor to the final DOM3 standard. Unfortunately it
        // is not layout independent, so it is as bad as using keyCode
        if (e.keyIdentifier) {
            // Non-character key?
            if (e.keyIdentifier.substr(0, 2) !== 'U+') {
                return e.keyIdentifier;
            }

            const codepoint = parseInt(e.keyIdentifier.substr(2), 16);
            const char = String.fromCharCode(codepoint).toUpperCase();

            return 'Platform' + char.charCodeAt();
        }

        return 'Unidentified';
    }

    _handleKeyDown(e) {
        const code = this._getKeyCode(e);
        let keysym = KeyboardUtil.getKeysym(e);

        // Windows doesn't have a proper AltGr, but handles it using
        // fake Ctrl+Alt. However the remote end might not be Windows,
        // so we need to merge those in to a single AltGr event. We
        // detect this case by seeing the two key events directly after
        // each other with a very short time between them (<50ms).
        if (this._altGrArmed) {
            this._altGrArmed = false;
            clearTimeout(this._altGrTimeout);

            if ((code === "AltRight") &&
                ((e.timeStamp - this._altGrCtrlTime) < 50)) {
                // FIXME: We fail to detect this if either Ctrl key is
                //        first manually pressed as Windows then no
                //        longer sends the fake Ctrl down event. It
                //        does however happily send real Ctrl events
                //        even when AltGr is already down. Some
                //        browsers detect this for us though and set the
                //        key to "AltGraph".
                keysym = KeyTable.XK_ISO_Level3_Shift;
            } else {
                this._sendKeyEvent(KeyTable.XK_Control_L, "ControlLeft", true);
            }
        }

        // We cannot handle keys we cannot track, but we also need
        // to deal with virtual keyboards which omit key info
        if (code === 'Unidentified') {
            if (keysym) {
                // If it's a virtual keyboard then it should be
                // sufficient to just send press and release right
                // after each other
                this._sendKeyEvent(keysym, code, true);
                this._sendKeyEvent(keysym, code, false);
            }

            stopEvent(e);
            return;
        }

        // Alt behaves more like AltGraph on macOS, so shuffle the
        // keys around a bit to make things more sane for the remote
        // server. This method is used by RealVNC and TigerVNC (and
        // possibly others).
        if (browser.isMac() || browser.isIOS()) {
            switch (keysym) {
                case KeyTable.XK_Super_L:
                    keysym = KeyTable.XK_Alt_L;
                    break;
                case KeyTable.XK_Super_R:
                    keysym = KeyTable.XK_Super_L;
                    break;
                case KeyTable.XK_Alt_L:
                    keysym = KeyTable.XK_Mode_switch;
                    break;
                case KeyTable.XK_Alt_R:
                    keysym = KeyTable.XK_ISO_Level3_Shift;
                    break;
            }
        }

        // Is this key already pressed? If so, then we must use the
        // same keysym or we'll confuse the server
        if (code in this._keyDownList) {
            keysym = this._keyDownList[code];
        }

        // macOS doesn't send proper key events for modifiers, only
        // state change events. That gets extra confusing for CapsLock
        // which toggles on each press, but not on release. So pretend
        // it was a quick press and release of the button.
        if ((browser.isMac() || browser.isIOS()) && (code === 'CapsLock')) {
            this._sendKeyEvent(KeyTable.XK_Caps_Lock, 'CapsLock', true);
            this._sendKeyEvent(KeyTable.XK_Caps_Lock, 'CapsLock', false);
            stopEvent(e);
            return;
        }

        // Windows doesn't send proper key releases for a bunch of
        // Japanese IM keys so we have to fake the release right away
        const jpBadKeys = [ KeyTable.XK_Zenkaku_Hankaku,
                            KeyTable.XK_Eisu_toggle,
                            KeyTable.XK_Katakana,
                            KeyTable.XK_Hiragana,
                            KeyTable.XK_Romaji ];
        if (browser.isWindows() && jpBadKeys.includes(keysym)) {
            this._sendKeyEvent(keysym, code, true);
            this._sendKeyEvent(keysym, code, false);
            stopEvent(e);
            return;
        }

        stopEvent(e);

        // Possible start of AltGr sequence? (see above)
        if ((code === "ControlLeft") && browser.isWindows() &&
            !("ControlLeft" in this._keyDownList)) {
            this._altGrArmed = true;
            this._altGrTimeout = setTimeout(this._handleAltGrTimeout.bind(this), 100);
            this._altGrCtrlTime = e.timeStamp;
            return;
        }

        this._sendKeyEvent(keysym, code, true);
    }

    _handleKeyUp(e) {
        stopEvent(e);

        const code = this._getKeyCode(e);

        // We can't get a release in the middle of an AltGr sequence, so
        // abort that detection
        if (this._altGrArmed) {
            this._altGrArmed = false;
            clearTimeout(this._altGrTimeout);
            this._sendKeyEvent(KeyTable.XK_Control_L, "ControlLeft", true);
        }

        // See comment in _handleKeyDown()
        if ((browser.isMac() || browser.isIOS()) && (code === 'CapsLock')) {
            this._sendKeyEvent(KeyTable.XK_Caps_Lock, 'CapsLock', true);
            this._sendKeyEvent(KeyTable.XK_Caps_Lock, 'CapsLock', false);
            return;
        }

        this._sendKeyEvent(this._keyDownList[code], code, false);

        // Windows has a rather nasty bug where it won't send key
        // release events for a Shift button if the other Shift is still
        // pressed
        if (browser.isWindows() && ((code === 'ShiftLeft') ||
                                    (code === 'ShiftRight'))) {
            if ('ShiftRight' in this._keyDownList) {
                this._sendKeyEvent(this._keyDownList['ShiftRight'],
                                   'ShiftRight', false);
            }
            if ('ShiftLeft' in this._keyDownList) {
                this._sendKeyEvent(this._keyDownList['ShiftLeft'],
                                   'ShiftLeft', false);
            }
        }
    }

    _handleAltGrTimeout() {
        this._altGrArmed = false;
        clearTimeout(this._altGrTimeout);
        this._sendKeyEvent(KeyTable.XK_Control_L, "ControlLeft", true);
    }

    _allKeysUp() {
        Log.Debug(">> Keyboard.allKeysUp");
        for (let code in this._keyDownList) {
            this._sendKeyEvent(this._keyDownList[code], code, false);
        }
        Log.Debug("<< Keyboard.allKeysUp");
    }

    // ===== PUBLIC METHODS =====

    grab() {
        //Log.Debug(">> Keyboard.grab");

        this._target.addEventListener('keydown', this._eventHandlers.keydown);
        this._target.addEventListener('keyup', this._eventHandlers.keyup);

        // Release (key up) if window loses focus
        window.addEventListener('blur', this._eventHandlers.blur);

        //Log.Debug("<< Keyboard.grab");
    }

    ungrab() {
        //Log.Debug(">> Keyboard.ungrab");

        this._target.removeEventListener('keydown', this._eventHandlers.keydown);
        this._target.removeEventListener('keyup', this._eventHandlers.keyup);
        window.removeEventListener('blur', this._eventHandlers.blur);

        // Release (key up) all keys that are in a down state
        this._allKeysUp();

        //Log.Debug(">> Keyboard.ungrab");
    }

    // 키 입력을 제한하기 위한 검사
    restrict_check() {
        return new Promise( (resolve, reject) => {
            RESTRICT_LIST.forEach((key_combination) => {
                const keyCount = key_combination.length;
                let equalCount = 0;
                for(let code of key_combination) {
                    if(this._keyDownList[code]) {
                        ++equalCount;
                    }
                }
                if(keyCount === equalCount){
                    console.log(key_combination);
                    resolve('false');
                } 
            });
            
            resolve('true');
        } );
    }

    // 현재 키를 입력 중인지 확인하기 위한 검사
    push_check(code) {
        if(this._keyDownList[code]) {
            return true;
        } else {
            return false;
        }
    }
}