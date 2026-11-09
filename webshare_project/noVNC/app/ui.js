/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC Authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

import * as Log from '../core/util/logging.js';
import _, { l10n } from './localization.js';
import { isTouchDevice, isSafari, hasScrollbarGutter, dragThreshold }
    from '../core/util/browser.js';
import { setCapture, getPointerEvent } from '../core/util/events.js';
import KeyTable from "../core/input/keysym.js";
import keysyms from "../core/input/keysymdef.js";
import Keyboard from "../core/input/keyboard.js";
import KorKeyTable from "../core/input/kokeys.js";
import RFB from "../core/rfb.js";
import * as WebUtil from "./webutil.js";

const PAGE_TITLE = "webshare";

const EVENT_PAGE_BACK = [
    { keysym : KeyTable.XK_Alt_L, code : 'AltLeft' },
    { keysym : KeyTable.XK_Left,  code : 'ArrowLeft' }
];
const EVENT_PAGE_FRONT = [
    { keysym : KeyTable.XK_Alt_L, code : 'AltLeft' },
    { keysym : KeyTable.XK_Right, code : 'ArrowRight' }
];
const EVENT_PAGE_REFRESH = [
    { keysym : KeyTable.XK_F5, code : 'F5' }
];
const EVENT_LANG_KOR = [
    { keysym : KeyTable.XK_Control_L, code : 'ControlLeft' },
    { keysym : KeyTable.XK_k,  code : 'Keyk' }
];
const EVENT_LANG_ENG = [
    { keysym : KeyTable.XK_Control_L, code : 'ControlLeft' },
    { keysym : KeyTable.XK_e,  code : 'Keye' }
];

const UI = {

    connected: false,
    desktopName: "",

    statusTimeout: null,
    hideKeyboardTimeout: null,
    idleControlbarTimeout: null,
    closeControlbarTimeout: null,

    controlbarGrabbed: false,
    controlbarDrag: false,
    controlbarMouseDownClientY: 0,
    controlbarMouseDownOffsetY: 0,

    lastKeyboardinput: null,
    defaultKeyboardinputLen: 100,

    inhibitReconnect: true,
    reconnectCallback: null,
    reconnectPassword: null,

    // 알맞은 언어 타입을 적용하기 위함 
    // 최근에 적용된 언어 타입을 가진다.
    lastLang: '',
    // 안드로이드 버추얼 키보드 비활성화 문제 해결을 위함
    // 최근에 resize된 윈도우의 사이즈를 가진다.
    lastWinSize: {width: window.outerWidth, height: window.outerHeight},

    prime() {
        return WebUtil.initSettings().then(() => {
            if (document.readyState === "interactive" || document.readyState === "complete") {
                return UI.start();
            }

            return new Promise((resolve, reject) => {
                document.addEventListener('DOMContentLoaded', () => UI.start().then(resolve).catch(reject));
            });
        });
    },

    // 기본적인 UI와 세팅메뉴를 초기화 그려준다.
    start() {

        UI.initSettings();

        // DOM을 번역
        l10n.translateDOM();

        // noVNC에 관여하는 라이브러리 호출
        fetch('./package.json')
            .then((response) => {
                if (!response.ok) {
                    throw Error("" + response.status + " " + response.statusText);
                }
                return response.json();
            })
            .then((packageInfo) => {
                Array.from(document.getElementsByClassName('noVNC_version')).forEach(el => el.innerText = packageInfo.version);
            })
            .catch((err) => {
                Log.Error("Couldn't fetch package.json: " + err);
                Array.from(document.getElementsByClassName('noVNC_version_wrapper'))
                    .concat(Array.from(document.getElementsByClassName('noVNC_version_separator')))
                    .forEach(el => el.style.display = 'none');
            });

        // 터치가 필요한 장치를 위한 세팅
        if (isTouchDevice) {
            document.documentElement.classList.add("noVNC_touch");
            // 주소창 제거
            setTimeout(() => window.scrollTo(0, 1), 100);
        }

        // 컨트롤 바 위치
        // ?
        if (WebUtil.readSetting('controlbar_pos') === 'right') {
            UI.toggleControlbarSide();
        }
        
        UI.initFullscreen(); 

        // 이벤트 헨들러 세팅
        UI.addControlbarHandlers();     
        UI.addTouchSpecificHandlers(); 
        UI.addExtraKeysHandlers();      
        UI.addMachineHandlers();        
        UI.addConnectionControlHandlers();
        UI.addClipboardHandlers();
        UI.addSettingsHandlers();
        UI.addWindowHandlers();

        // 새로 추가 이벤트 핸들러
        UI.addCustomHandlers();

        // 상단 알림바 클릭시 사라짐 이벤트
        document.getElementById("noVNC_status")
            .addEventListener('click', UI.hideStatus);

        // Bootstrap fallback input handler
        UI.keyboardinputReset();

        // 더이상 noVNC의 메뉴는 쓰지 않을 것이므로 
        // 컨트롤바는 비활성화 한다.
        // UI.openControlbar();
        
        UI.updateVisualState('init');

        // 초기화 중인 상태에서 [...] DOM 제거
        document.documentElement.classList.remove("noVNC_loading");

        // 자동 연결 부분 
        // 파라미터에 autoconnect가 있는 경우
        let autoconnect = WebUtil.getConfigVar('autoconnect', false);
        if (autoconnect === 'true' || autoconnect == '1') {
            autoconnect = true;
            UI.connect();
        } else {
            autoconnect = false;
            // 자동 연결이 아닌 경우 첫 번째 로드 시 연결을 위한 UI 표시
            UI.openConnectPanel();
        }

        return Promise.resolve(UI.rfb);
    },

    initFullscreen() {
        // 풀스크린이 잘 지원되는 브라우저의 경우 버튼을 보여준다.
        // * Safari는 전체 화면에 있는 동안 영숫자 입력을 지원하지 않습니다.
        if (!isSafari() &&
            (document.documentElement.requestFullscreen ||
             document.documentElement.mozRequestFullScreen ||
             document.documentElement.webkitRequestFullscreen ||
             document.body.msRequestFullscreen)) {
            document.getElementById('noVNC_fullscreen_button')
                .classList.remove("noVNC_hidden");
            UI.addFullscreenHandlers();
        }
    },

    initSettings() {
        // noVNC 설정관련 초기화 

        // 로깅 설정 초기화
        const llevels = ['error', 'warn', 'info', 'debug'];
        for (let i = 0; i < llevels.length; i += 1) {
            UI.addOption(document.getElementById('noVNC_setting_logging'), llevels[i], llevels[i]);
        }

        UI.initSetting('logging', 'warn');
        UI.updateLogging();

        // port == 80 (or 443) 는 존재하지 않으며 수동으로 설정해야 함
        let port = window.location.port;
        if (!port) {
            if (window.location.protocol.substring(0, 5) == 'https') {
                port = 443;
            } else if (window.location.protocol.substring(0, 4) == 'http') {
                port = 80;
            }
        }

        /* 설정 컨트롤값을 기본값으로 세팅한다.(URL 쿼리스트링을 기반하여) */
        UI.initSetting('host', window.location.hostname);
        UI.initSetting('port', port);
        UI.initSetting('encrypt', (window.location.protocol === "https:"));
        UI.initSetting('view_clip', false);
        UI.initSetting('resize', 'off');
        UI.initSetting('quality', 6);
        UI.initSetting('compression', 2);
        UI.initSetting('shared', true);
        UI.initSetting('view_only', false);
        UI.initSetting('show_dot', false);
        UI.initSetting('path', 'websockify');
        UI.initSetting('repeaterID', '');
        UI.initSetting('reconnect', false);
        UI.initSetting('reconnect_delay', 5000);
        
        // 세팅 라벨 
        UI.setupSettingLabels();
    },
    // 세팅 체크박스에 label 태그로 묶음
    setupSettingLabels() {
        const labels = document.getElementsByTagName('LABEL');
        for (let i = 0; i < labels.length; i++) {
            const htmlFor = labels[i].htmlFor;
            if (htmlFor != '') {
                const elem = document.getElementById(htmlFor);
                if (elem) elem.label = labels[i];
            } else {
                // If 'for' isn't set, use the first input element child
                const children = labels[i].children;
                for (let j = 0; j < children.length; j++) {
                    if (children[j].form !== undefined) {
                        children[j].label = labels[i];
                        break;
                    }
                }
            }
        }
    },

/* ------^-------
*  /초기화 과정 끝
* ==============
*  UI 이벤트 핸들러
* ------v------*/

    addControlbarHandlers() {
        document.getElementById("noVNC_control_bar")
            .addEventListener('mousemove', UI.activateControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('mouseup', UI.activateControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('mousedown', UI.activateControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('keydown', UI.activateControlbar);

        document.getElementById("noVNC_control_bar")
            .addEventListener('mousedown', UI.keepControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('keydown', UI.keepControlbar);

        document.getElementById("noVNC_view_drag_button")
             .addEventListener('click', UI.toggleViewDrag);
        //   .addEventListener('click', UI.toggleDragMode);

        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('mousedown', UI.controlbarHandleMouseDown);
        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('mouseup', UI.controlbarHandleMouseUp);
        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('mousemove', UI.dragControlbarHandle);
        // 요소에 대해 크기 조정 이벤트를 사용할 수 없음
        window.addEventListener('resize', UI.updateControlbarHandle);

        // 고급설정 버튼 관련 이벤트
        const exps = document.getElementsByClassName("noVNC_expander");
        for (let i = 0;i < exps.length;i++) {
            exps[i].addEventListener('click', UI.toggleExpander);
        }
    },

    addTouchSpecificHandlers() {
        // 터치 전용 이벤트 핸들러
        document.getElementById("noVNC_keyboard_button")
            .addEventListener('click', UI.toggleVirtualKeyboard);
        UI.touchKeyboard = new Keyboard(document.getElementById('noVNC_keyboardinput'));
        UI.touchKeyboard.onkeyevent = UI.keyEvent;
        UI.touchKeyboard.grab();
        document.getElementById("noVNC_keyboardinput")
            .addEventListener('input', UI.keyInput);
        document.getElementById("noVNC_keyboardinput")
            .addEventListener('focus', UI.onfocusVirtualKeyboard);
        document.getElementById("noVNC_keyboardinput")
            .addEventListener('blur', UI.onblurVirtualKeyboard);
        document.getElementById("noVNC_keyboardinput")
            .addEventListener('submit', () => false);

        document.documentElement
            .addEventListener('mousedown', UI.keepVirtualKeyboard, true);

        document.getElementById("noVNC_control_bar")
            .addEventListener('touchstart', UI.activateControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('touchmove', UI.activateControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('touchend', UI.activateControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('input', UI.activateControlbar);

        document.getElementById("noVNC_control_bar")
            .addEventListener('touchstart', UI.keepControlbar);
        document.getElementById("noVNC_control_bar")
            .addEventListener('input', UI.keepControlbar);

        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('touchstart', UI.controlbarHandleMouseDown);
        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('touchend', UI.controlbarHandleMouseUp);
        document.getElementById("noVNC_control_bar_handle")
            .addEventListener('touchmove', UI.dragControlbarHandle);
    },

    addExtraKeysHandlers() {
        // 추가 키 핸들러 
        // (컨트롤 알트 윈도우 탭 ESC Ctrl+Alt+Del)
        document.getElementById("noVNC_toggle_extra_keys_button")
            .addEventListener('click', UI.toggleExtraKeys);
        document.getElementById("noVNC_toggle_ctrl_button")
            .addEventListener('click', UI.toggleCtrl);
        document.getElementById("noVNC_toggle_windows_button")
            .addEventListener('click', UI.toggleWindows);
        document.getElementById("noVNC_toggle_alt_button")
            .addEventListener('click', UI.toggleAlt);
        document.getElementById("noVNC_send_tab_button")
            .addEventListener('click', UI.sendTab);
        document.getElementById("noVNC_send_esc_button")
            .addEventListener('click', UI.sendEsc);
        document.getElementById("noVNC_send_ctrl_alt_del_button")
            .addEventListener('click', UI.sendCtrlAltDel);
    },

    addMachineHandlers() {
        // ?
        document.getElementById("noVNC_shutdown_button")
            .addEventListener('click', () => UI.rfb.machineShutdown());
        document.getElementById("noVNC_reboot_button")
            .addEventListener('click', () => UI.rfb.machineReboot());
        document.getElementById("noVNC_reset_button")
            .addEventListener('click', () => UI.rfb.machineReset());
        document.getElementById("noVNC_power_button")
            .addEventListener('click', UI.togglePowerPanel);
    },

    addConnectionControlHandlers() {
        // 연결 기능 키 핸들러
        document.getElementById("noVNC_disconnect_button")
            .addEventListener('click', UI.disconnect);
        document.getElementById("noVNC_connect_button")
            .addEventListener('click', UI.connect);
        document.getElementById("noVNC_cancel_reconnect_button")
            .addEventListener('click', UI.cancelReconnect);
        document.getElementById("noVNC_credentials_button")
            .addEventListener('click', UI.setCredentials);
    },

    addClipboardHandlers() {
        // 클립보드 기능 키 핸들러
        document.getElementById("noVNC_clipboard_button")
            .addEventListener('click', UI.toggleClipboardPanel);
        document.getElementById("noVNC_clipboard_text")
            .addEventListener('change', UI.clipboardSend);
        document.getElementById("noVNC_clipboard_clear_button")
            .addEventListener('click', UI.clipboardClear);
    },

    // 
    addSettingChangeHandler(name, changeFunc) {
        // 설정 세팅 관련 버튼 핸들러
        const settingElem = document.getElementById("noVNC_setting_" + name);
        if (changeFunc === undefined) {
            changeFunc = () => UI.saveSetting(name);
        }
        settingElem.addEventListener('change', changeFunc);
    },

    addSettingsHandlers() {
        
        document.getElementById("noVNC_settings_button")
            .addEventListener('click', UI.toggleSettingsPanel);

        UI.addSettingChangeHandler('encrypt');
        UI.addSettingChangeHandler('resize');
        UI.addSettingChangeHandler('resize', UI.applyResizeMode);
        UI.addSettingChangeHandler('resize', UI.updateViewClip);
        UI.addSettingChangeHandler('quality');
        UI.addSettingChangeHandler('quality', UI.updateQuality);
        UI.addSettingChangeHandler('compression');
        UI.addSettingChangeHandler('compression', UI.updateCompression);
        UI.addSettingChangeHandler('view_clip');
        UI.addSettingChangeHandler('view_clip', UI.updateViewClip);
        UI.addSettingChangeHandler('shared');
        UI.addSettingChangeHandler('view_only');
        UI.addSettingChangeHandler('view_only', UI.updateViewOnly);
        UI.addSettingChangeHandler('show_dot');
        UI.addSettingChangeHandler('show_dot', UI.updateShowDotCursor);
        UI.addSettingChangeHandler('host');
        UI.addSettingChangeHandler('port');
        UI.addSettingChangeHandler('path');
        UI.addSettingChangeHandler('repeaterID');
        UI.addSettingChangeHandler('logging');
        UI.addSettingChangeHandler('logging', UI.updateLogging);
        UI.addSettingChangeHandler('reconnect');
        UI.addSettingChangeHandler('reconnect_delay');
    },

    addFullscreenHandlers() {
        // 풀스크린 기능 핸들러
        document.getElementById("noVNC_fullscreen_button")
            .addEventListener('click', UI.toggleFullscreen);

        window.addEventListener('fullscreenchange', UI.updateFullscreenButton);
        window.addEventListener('mozfullscreenchange', UI.updateFullscreenButton);
        window.addEventListener('webkitfullscreenchange', UI.updateFullscreenButton);
        window.addEventListener('msfullscreenchange', UI.updateFullscreenButton);
    },

    addCustomHandlers() {
        // 페이지 뒤로 가기
        document.getElementById('noVNC_backward_button')
            .addEventListener('click', () => {
            UI.sendKeys(EVENT_PAGE_BACK, true);
            UI.sendKeys(EVENT_PAGE_BACK, false);
        });

        // 페이지 앞으로 가기
        document.getElementById('noVNC_forward_button')
            .addEventListener('click', () => {
            UI.sendKeys(EVENT_PAGE_FRONT, true);
            UI.sendKeys(EVENT_PAGE_FRONT, false);
        });

        // 새로고침
        document.getElementById('noVNC_refresh_button')
            .addEventListener('click', () => {
            UI.sendKeys(EVENT_PAGE_REFRESH);
        });
    },

/* ------^-------
 * /UI 이벤트 핸들러 끝
 * ==============
 *     비주얼 
 * ------v------*/

    // 연결 상태 맞게 뷰가 달라지게 하기 위함
    updateVisualState(state) {

        document.documentElement.classList.remove("noVNC_connecting");
        document.documentElement.classList.remove("noVNC_connected");
        document.documentElement.classList.remove("noVNC_disconnecting");
        document.documentElement.classList.remove("noVNC_reconnecting");

        // 상태 뷰 표시
        // 연결중, 연결됨, 연결끊김중, 연결끊김, 재연결중

        const transitionElem = document.getElementById("noVNC_transition_text");
        switch (state) {
            case 'init':
                break;
            case 'connecting':
                transitionElem.textContent = _("Connecting...");
                document.documentElement.classList.add("noVNC_connecting");
                break;
            case 'connected':
                document.documentElement.classList.add("noVNC_connected");
                break;
            case 'disconnecting':
                transitionElem.textContent = _("Disconnecting...");
                document.documentElement.classList.add("noVNC_disconnecting");
                break;
            case 'disconnected':
                break;
            case 'reconnecting':
                transitionElem.textContent = _("Reconnecting...");
                document.documentElement.classList.add("noVNC_reconnecting");
                break;
            default:
                Log.Error("Invalid visual state: " + state);
                UI.showStatus(_("Internal error"), 'error');
                return;
        }

        if (UI.connected) {
            UI.updateViewClip();

            UI.disableSetting('encrypt');
            UI.disableSetting('shared');
            UI.disableSetting('host');
            UI.disableSetting('port');
            UI.disableSetting('path');
            UI.disableSetting('repeaterID');

            // 2초후 컨트롤바 숨김
            //UI.closeControlbarTimeout = setTimeout(UI.closeControlbar, 2000);
        } else {
            UI.enableSetting('encrypt');
            UI.enableSetting('shared');
            UI.enableSetting('host');
            UI.enableSetting('port');
            UI.enableSetting('path');
            UI.enableSetting('repeaterID');
            UI.updatePowerButton();
            UI.keepControlbar();
        }

        // 연결 상태가 바뀐 경우 연결 패널은 더이상 필요 없으므로 제거함
        UI.closeAllPanels();
        document.getElementById('noVNC_credentials_dlg')
            .classList.remove('noVNC_open');
    },

    // 상단 연결 상태창 노출
    showStatus(text, statusType, time) {

        // 필요 없으므로 띄우지 않음
        return;

        const statusElem = document.getElementById('noVNC_status');

        if (typeof statusType === 'undefined') {
            statusType = 'normal';
        }

        // 심각한 상태를 덮어쓰지 말고 오류가 발생하지 않도록 하십시오. 
        // 처음 오류만 표시한다. 
        if (statusElem.classList.contains("noVNC_open")) {
            if (statusElem.classList.contains("noVNC_status_error")) {
                return;
            }
            if (statusElem.classList.contains("noVNC_status_warn") &&
                statusType === 'normal') {
                return;
            }
        }

        clearTimeout(UI.statusTimeout);

        switch (statusType) {
            case 'error':
                statusElem.classList.remove("noVNC_status_warn");
                statusElem.classList.remove("noVNC_status_normal");
                statusElem.classList.add("noVNC_status_error");
                break;
            case 'warning':
            case 'warn':
                statusElem.classList.remove("noVNC_status_error");
                statusElem.classList.remove("noVNC_status_normal");
                statusElem.classList.add("noVNC_status_warn");
                break;
            case 'normal':
            case 'info':
            default:
                statusElem.classList.remove("noVNC_status_error");
                statusElem.classList.remove("noVNC_status_warn");
                statusElem.classList.add("noVNC_status_normal");
                break;
        }

        statusElem.textContent = text;
        statusElem.classList.add("noVNC_open");

        // 시간이 지정되지 않은 경우 1.5초 동안의 상태를 표시
        if (typeof time === 'undefined') {
            time = 1500;
        }

        // 오류 메시지가 시간 초과되지 않음
        if (statusType !== 'error') {
            UI.statusTimeout = window.setTimeout(UI.hideStatus, time);
        }
    },

    // 상단 연결 상태창 숨김처리 
    hideStatus() {
        clearTimeout(UI.statusTimeout);
        document.getElementById('noVNC_status').classList.remove("noVNC_open");
    },

    // 컨트롤바 활성화
    // 갖다 대고 있으면 자동 숨겨짐 처리를 막음
    activateControlbar(event) {
        clearTimeout(UI.idleControlbarTimeout);
        // 실제 막대 대신 앵커를 조작하여 새 스택 그룹을 만들지 않도록 합니다.
        document.getElementById('noVNC_control_bar_anchor')
            .classList.remove("noVNC_idle");
        UI.idleControlbarTimeout = window.setTimeout(UI.idleControlbar, 2000);
    },

    // 컨트롤바 고정
    idleControlbar() {
        // 자식 컨트롤바가 포커싱되어 있으면 희미해짐 처리 하지 않는다.
        if (document.getElementById('noVNC_control_bar')
            .contains(document.activeElement) && document.hasFocus()) {
            UI.activateControlbar();
            return;
        }

        document.getElementById('noVNC_control_bar_anchor')
            .classList.add("noVNC_idle");
    },

    // 컨트롤바 숨김 타이머 초기화
    keepControlbar() {
        clearTimeout(UI.closeControlbarTimeout);
    },

    // 컨트롤바 표시
    openControlbar() {
        document.getElementById('noVNC_control_bar')
            .classList.add("noVNC_open");
    },

    // 컨트롤바 닫기
    closeControlbar() {
        UI.closeAllPanels();
        document.getElementById('noVNC_control_bar')
            .classList.remove("noVNC_open");
        UI.rfb.focus();
    },

    // 컨트롤바 핸들 노출
    openControlbarHandle() {
        const handle = document.getElementById("noVNC_control_bar_handle");
        handle.style.display = "block";
    },

    // 컨트롤바 핸들 숨기기
    hideControlbarHandle() {
        const handle = document.getElementById("noVNC_control_bar_handle");
        handle.style.display = "none";
    },

    // 컨트롤바 설정 변경
    toggleControlbar() {
        if (document.getElementById('noVNC_control_bar')
            .classList.contains("noVNC_open")) {
            UI.closeControlbar();
        } else {
            UI.openControlbar();
        }
    },

    // 컨트롤바 사라지는 애니메이션 
    toggleControlbarSide() {
        // Temporarily disable animation, if bar is displayed, to avoid weird
        // movement. The transitionend-event will not fire when display=none.
        const bar = document.getElementById('noVNC_control_bar');
        const barDisplayStyle = window.getComputedStyle(bar).display;
        if (barDisplayStyle !== 'none') {
            bar.style.transitionDuration = '0s';
            bar.addEventListener('transitionend', () => bar.style.transitionDuration = '');
        }

        const anchor = document.getElementById('noVNC_control_bar_anchor');
        if (anchor.classList.contains("noVNC_right")) {
            WebUtil.writeSetting('controlbar_pos', 'left');
            anchor.classList.remove("noVNC_right");
        } else {
            WebUtil.writeSetting('controlbar_pos', 'right');
            anchor.classList.add("noVNC_right");
        }

        // Consider this a movement of the handle
        UI.controlbarDrag = true;
    },

    showControlbarHint(show) {
        const hint = document.getElementById('noVNC_control_bar_hint');
        if (show) {
            hint.classList.add("noVNC_active");
        } else {
            hint.classList.remove("noVNC_active");
        }
    },

    dragControlbarHandle(e) {
        if (!UI.controlbarGrabbed) return;

        const ptr = getPointerEvent(e);

        const anchor = document.getElementById('noVNC_control_bar_anchor');
        if (ptr.clientX < (window.innerWidth * 0.1)) {
            if (anchor.classList.contains("noVNC_right")) {
                UI.toggleControlbarSide();
            }
        } else if (ptr.clientX > (window.innerWidth * 0.9)) {
            if (!anchor.classList.contains("noVNC_right")) {
                UI.toggleControlbarSide();
            }
        }

        if (!UI.controlbarDrag) {
            const dragDistance = Math.abs(ptr.clientY - UI.controlbarMouseDownClientY);

            if (dragDistance < dragThreshold) return;

            UI.controlbarDrag = true;
        }

        const eventY = ptr.clientY - UI.controlbarMouseDownOffsetY;

        UI.moveControlbarHandle(eventY);

        e.preventDefault();
        e.stopPropagation();
        UI.keepControlbar();
        UI.activateControlbar();
    },

    // 컨트롤바 핸들 위치를 옮길 수 있지만, 페이지 경계값을 벗어날 수 없음
    moveControlbarHandle(viewportRelativeY) {
        const handle = document.getElementById("noVNC_control_bar_handle");
        const handleHeight = handle.getBoundingClientRect().height;
        const controlbarBounds = document.getElementById("noVNC_control_bar")
            .getBoundingClientRect();
        const margin = 10;

        // These heights need to be non-zero for the below logic to work
        if (handleHeight === 0 || controlbarBounds.height === 0) {
            return;
        }

        let newY = viewportRelativeY;

        // Check if the coordinates are outside the control bar
        if (newY < controlbarBounds.top + margin) {
            // Force coordinates to be below the top of the control bar
            newY = controlbarBounds.top + margin;

        } else if (newY > controlbarBounds.top +
                   controlbarBounds.height - handleHeight - margin) {
            // Force coordinates to be above the bottom of the control bar
            newY = controlbarBounds.top +
                controlbarBounds.height - handleHeight - margin;
        }

        // Corner case: control bar too small for stable position
        if (controlbarBounds.height < (handleHeight + margin * 2)) {
            newY = controlbarBounds.top +
                (controlbarBounds.height - handleHeight) / 2;
        }

        // The transform needs coordinates that are relative to the parent
        const parentRelativeY = newY - controlbarBounds.top;
        handle.style.transform = "translateY(" + parentRelativeY + "px)";
    },

    updateControlbarHandle() {
        // Since the control bar is fixed on the viewport and not the page,
        // the move function expects coordinates relative the the viewport.
        const handle = document.getElementById("noVNC_control_bar_handle");
        const handleBounds = handle.getBoundingClientRect();
        UI.moveControlbarHandle(handleBounds.top);
    },

    controlbarHandleMouseUp(e) {
        if ((e.type == "mouseup") && (e.button != 0)) return;

        // mouseup and mousedown on the same place toggles the controlbar
        if (UI.controlbarGrabbed && !UI.controlbarDrag) {
            UI.toggleControlbar();
            e.preventDefault();
            e.stopPropagation();
            UI.keepControlbar();
            UI.activateControlbar();
        }
        UI.controlbarGrabbed = false;
        UI.showControlbarHint(false);
    },

    controlbarHandleMouseDown(e) {
        if ((e.type == "mousedown") && (e.button != 0)) return;

        const ptr = getPointerEvent(e);

        const handle = document.getElementById("noVNC_control_bar_handle");
        const bounds = handle.getBoundingClientRect();

        // Touch events have implicit capture
        if (e.type === "mousedown") {
            setCapture(handle);
        }

        UI.controlbarGrabbed = true;
        UI.controlbarDrag = false;

        UI.showControlbarHint(true);

        UI.controlbarMouseDownClientY = ptr.clientY;
        UI.controlbarMouseDownOffsetY = ptr.clientY - bounds.top;
        e.preventDefault();
        e.stopPropagation();
        UI.keepControlbar();
        UI.activateControlbar();
    },

    toggleExpander(e) {
        if (this.classList.contains("noVNC_open")) {
            this.classList.remove("noVNC_open");
        } else {
            this.classList.add("noVNC_open");
        }
    },

/* ------^-------
 *    /비주얼
 * ==============
 *      설정
 * ------v------*/

    // Initial page load read/initialization of settings
    initSetting(name, defVal) {
        // Check Query string followed by cookie
        let val = WebUtil.getConfigVar(name);
        if (val === null) {
            val = WebUtil.readSetting(name, defVal);
        }
        WebUtil.setSetting(name, val);
        UI.updateSetting(name);
        return val;
    },

    // Set the new value, update and disable form control setting
    forceSetting(name, val) {
        WebUtil.setSetting(name, val);
        UI.updateSetting(name);
        UI.disableSetting(name);
    },

    // Update cookie and form control setting. If value is not set, then
    // updates from control to current cookie setting.
    updateSetting(name) {

        // Update the settings control
        let value = UI.getSetting(name);

        const ctrl = document.getElementById('noVNC_setting_' + name);
        if (ctrl.type === 'checkbox') {
            ctrl.checked = value;

        } else if (typeof ctrl.options !== 'undefined') {
            for (let i = 0; i < ctrl.options.length; i += 1) {
                if (ctrl.options[i].value === value) {
                    ctrl.selectedIndex = i;
                    break;
                }
            }
        } else {
            ctrl.value = value;
        }
    },

    // Save control setting to cookie
    saveSetting(name) {
        const ctrl = document.getElementById('noVNC_setting_' + name);
        let val;
        if (ctrl.type === 'checkbox') {
            val = ctrl.checked;
        } else if (typeof ctrl.options !== 'undefined') {
            val = ctrl.options[ctrl.selectedIndex].value;
        } else {
            val = ctrl.value;
        }
        WebUtil.writeSetting(name, val);
        //Log.Debug("Setting saved '" + name + "=" + val + "'");
        return val;
    },

    // Read form control compatible setting from cookie
    getSetting(name) {
        const ctrl = document.getElementById('noVNC_setting_' + name);
        let val = WebUtil.readSetting(name);
        if (typeof val !== 'undefined' && val !== null && ctrl.type === 'checkbox') {
            if (val.toString().toLowerCase() in {'0': 1, 'no': 1, 'false': 1}) {
                val = false;
            } else {
                val = true;
            }
        }
        return val;
    },

    // These helpers compensate for the lack of parent-selectors and
    // previous-sibling-selectors in CSS which are needed when we want to
    // disable the labels that belong to disabled input elements.
    disableSetting(name) {
        const ctrl = document.getElementById('noVNC_setting_' + name);
        ctrl.disabled = true;
        ctrl.label.classList.add('noVNC_disabled');
    },

    enableSetting(name) {
        const ctrl = document.getElementById('noVNC_setting_' + name);
        ctrl.disabled = false;
        ctrl.label.classList.remove('noVNC_disabled');
    },

/* ------^-------
 *   /세팅
 * ==============
 *    판넬
 * ------v------*/

    closeAllPanels() {
        UI.closeSettingsPanel();
        UI.closePowerPanel();
        UI.closeClipboardPanel();
        UI.closeExtraKeys();
    },

/* ------^-------
 *   /판넬
 * ==============
 *    판넬 세팅
 * ------v------*/

    openSettingsPanel() {
        UI.closeAllPanels();
        UI.openControlbar();

        // Refresh UI elements from saved cookies
        UI.updateSetting('encrypt');
        UI.updateSetting('view_clip');
        UI.updateSetting('resize');
        UI.updateSetting('quality');
        UI.updateSetting('compression');
        UI.updateSetting('shared');
        UI.updateSetting('view_only');
        UI.updateSetting('path');
        UI.updateSetting('repeaterID');
        UI.updateSetting('logging');
        UI.updateSetting('reconnect');
        UI.updateSetting('reconnect_delay');

        document.getElementById('noVNC_settings')
            .classList.add("noVNC_open");
        document.getElementById('noVNC_settings_button')
            .classList.add("noVNC_selected");
    },

    closeSettingsPanel() {
        document.getElementById('noVNC_settings')
            .classList.remove("noVNC_open");
        document.getElementById('noVNC_settings_button')
            .classList.remove("noVNC_selected");
    },

    toggleSettingsPanel() {
        if (document.getElementById('noVNC_settings')
            .classList.contains("noVNC_open")) {
            UI.closeSettingsPanel();
        } else {
            UI.openSettingsPanel();
        }
    },

/* ------^-------
 *   /SETTINGS
 * ==============
 *     파워 설정
 *   (셧다운 리붓)
 * ------v------*/

    openPowerPanel() {
        UI.closeAllPanels();
        UI.openControlbar();

        document.getElementById('noVNC_power')
            .classList.add("noVNC_open");
        document.getElementById('noVNC_power_button')
            .classList.add("noVNC_selected");
    },

    closePowerPanel() {
        document.getElementById('noVNC_power')
            .classList.remove("noVNC_open");
        document.getElementById('noVNC_power_button')
            .classList.remove("noVNC_selected");
    },

    togglePowerPanel() {
        if (document.getElementById('noVNC_power')
            .classList.contains("noVNC_open")) {
            UI.closePowerPanel();
        } else {
            UI.openPowerPanel();
        }
    },

    // Disable/enable power button
    updatePowerButton() {
        if (UI.connected &&
            UI.rfb.capabilities.power &&
            !UI.rfb.viewOnly) {
            document.getElementById('noVNC_power_button')
                .classList.remove("noVNC_hidden");
        } else {
            document.getElementById('noVNC_power_button')
                .classList.add("noVNC_hidden");
            // Close power panel if open
            UI.closePowerPanel();
        }
    },

/* ------^-------
 *    /파워 설정
 * ==============
 *   클립보드
 * ------v------*/

    openClipboardPanel() {
        UI.closeAllPanels();
        UI.openControlbar();

        document.getElementById('noVNC_clipboard')
            .classList.add("noVNC_open");
        document.getElementById('noVNC_clipboard_button')
            .classList.add("noVNC_selected");
    },

    closeClipboardPanel() {
        document.getElementById('noVNC_clipboard')
            .classList.remove("noVNC_open");
        document.getElementById('noVNC_clipboard_button')
            .classList.remove("noVNC_selected");
    },

    toggleClipboardPanel() {
        if (document.getElementById('noVNC_clipboard')
            .classList.contains("noVNC_open")) {
            UI.closeClipboardPanel();
        } else {
            UI.openClipboardPanel();
        }
    },

    clipboardReceive(e) {
        Log.Debug(">> UI.clipboardReceive: " + e.detail.text.substr(0, 40) + "...");
        document.getElementById('noVNC_clipboard_text').value = e.detail.text;
        Log.Debug("<< UI.clipboardReceive");
    },

    clipboardClear() {
        document.getElementById('noVNC_clipboard_text').value = "";
        UI.rfb.clipboardPasteFrom("");
    },

    clipboardSend() {
        const text = document.getElementById('noVNC_clipboard_text').value;
        Log.Debug(">> UI.clipboardSend: " + text.substr(0, 40) + "...");
        UI.rfb.clipboardPasteFrom(text);
        Log.Debug("<< UI.clipboardSend");
    },

/* ------^-------
 *  /클립보드
 * ==============
 *      연결
 * ------v------*/

    // 판넬 노출 처리
    openConnectPanel() {
        document.getElementById('noVNC_connect_dlg')
            .classList.add("noVNC_open");
    },

    closeConnectPanel() {
        document.getElementById('noVNC_connect_dlg')
            .classList.remove("noVNC_open");
    },

    // 연결 작업
    connect(event, password) {

        // rfb가 이미 존재하면 리턴
        if (typeof UI.rfb !== 'undefined') {
            return;
        }

        const host = UI.getSetting('host'); // 호스트
        const port = UI.getSetting('port'); // 포트
        const path = UI.getSetting('path'); // 위치
        
        if (typeof password === 'undefined') {
            password = WebUtil.getConfigVar('password');
            UI.reconnectPassword = password;
        }

        if (password === null) {
            password = undefined;
        }

        UI.hideStatus();

        if (!host) {
            Log.Error("Can't connect when host is: " + host);
            UI.showStatus(_("Must set host"), 'error');
            return;
        }

        UI.closeConnectPanel();

        UI.updateVisualState('connecting');

        let url;

        // 암호화 세팅
        // wss(web socket secure), ws(web socket)
        url = UI.getSetting('encrypt') ? 'wss' : 'ws';

        // 입력받은 정보를 토대로 url 구성 작업
        url += '://' + host;
        if (port) {
            url += ':' + port;
        }
        url += '/' + path;

        // 연결 정보를 토대로 RFB(Remote Frame Buffer) 생성
        let options = {
            shared: UI.getSetting('shared'),
            repeaterID: UI.getSetting('repeaterID'),
            credentials: { password: password }
        };

        // 사용자 추가 UI, 이벤트 
        // 조작이 가능한 사용자만 띄워준다.
        if (!UI.getSetting('view_only')) {
            // const _menu = document.createElement('div');
            // _menu.id = 'noVNC_menu';

            // UI.make_menu(_menu);
            // options.ui = _menu;

            UI.openControlbar();
        }

        UI.rfb = new RFB(document.getElementById('noVNC_container'), url, options);

        // 연결 처리됨에 따른 rfb 이벤트 생성
        UI.rfb.addEventListener("connect", UI.connectFinished);
        UI.rfb.addEventListener("disconnect", UI.disconnectFinished);
        UI.rfb.addEventListener("credentialsrequired", UI.credentials);
        UI.rfb.addEventListener("securityfailure", UI.securityFailed);
        UI.rfb.addEventListener("capabilities", UI.updatePowerButton);
        UI.rfb.addEventListener("clipboard", UI.clipboardReceive);
        UI.rfb.addEventListener("bell", UI.bell);
        UI.rfb.addEventListener("desktopname", UI.updateDesktopName);

        // 설정값에 맞게 rfb 변수 세팅 
        UI.rfb.clipViewport = UI.getSetting('view_clip');
        UI.rfb.resizeSession = UI.getSetting('resize') === 'remote';
        UI.rfb.showDotCursor = UI.getSetting('show_dot');

        // 로컬 스케일링 설정
        UI.rfb.scaleViewport = true;
        // 품질, 압축률 설정
        UI.rfb.qualityLevel = 3;
        UI.rfb.compressionLevel = 0;
        // https://waterprogramming.files.wordpress.com/2016/06/compress_plot.png?w=660

        UI.updateViewOnly(); // requires UI.rfb
    },

    disconnect() {
        UI.rfb.disconnect();

        UI.connected = false;

        // 자동 재접속 비활성화
        UI.inhibitReconnect = true;

        UI.updateVisualState('disconnecting');

        // 실제로 연결이 종료될때까지 연결설정을 화면상에 띄우지 않아야 한다
    },

    reconnect() {
        UI.reconnectCallback = null;

        // 재연결이 비활성화 되어 있는 동안 아무 것도 하지 않음
        if (UI.inhibitReconnect) {
            return;
        }

        UI.connect(null, UI.reconnectPassword);
    },

    cancelReconnect() {
        if (UI.reconnectCallback !== null) {
            clearTimeout(UI.reconnectCallback);
            UI.reconnectCallback = null;
        }

        UI.updateVisualState('disconnected');

        UI.openControlbar();
        UI.openConnectPanel();
    },

    connectFinished(e) {
        UI.connected = true;
        UI.inhibitReconnect = false;

        let msg;
        if (UI.getSetting('encrypt')) {
            msg = _("Connected (encrypted) to ") + UI.desktopName;
        } else {
            msg = _("Connected (unencrypted) to ") + UI.desktopName;
        }
        UI.showStatus(msg);
        UI.updateVisualState('connected');
        
        if(UI.getSetting('view_only')) {
            UI.hideControlbarHandle();
        }

        //UI.rfb._resize(2000, 2000)
        // focus는 렌더링된 요소에서만 사용할 수 있으므로 마지막에 수행
        UI.rfb.focus();
    },

    disconnectFinished(e) {
        const wasConnected = UI.connected;

        // 이 변수는 연결이 끊겼을때 이상적으로 설정되지만, 
        // 연결 종료가 올바르게 되지 않았거나 서버에 의해 시작되면 
        // UI.disconnect()가 사용되지 않기 때문에 여기서도 이를 해야 한다.
        UI.connected = false;

        UI.rfb = undefined;

        if (!e.detail.clean) {
            UI.updateVisualState('disconnected');
            if (wasConnected) {
                UI.showStatus(_("Something went wrong, connection is closed"),
                              'error');
            } else {
                UI.showStatus(_("Failed to connect to server"), 'error');
            }
        } else if (UI.getSetting('reconnect', false) === true && !UI.inhibitReconnect) {
            UI.updateVisualState('reconnecting');

            const delay = parseInt(UI.getSetting('reconnect_delay'));
            UI.reconnectCallback = setTimeout(UI.reconnect, delay);
            return;
        } else {
            UI.updateVisualState('disconnected');
            UI.showStatus(_("Disconnected"), 'normal');
        }

        document.title = PAGE_TITLE;

        UI.openControlbar();
        UI.openConnectPanel();
    },

    securityFailed(e) {
        let msg = "";

        // 보안 실패에 대해서는 서버에서 에러 원인을 얻을 수 있다. 
        // 이 문자열이 변환되는지 아닌지는 제어할 수 없다.
        if ('reason' in e.detail) {
            msg = _("New connection has been rejected with reason: ") +
                e.detail.reason;
        } else {
            msg = _("New connection has been rejected");
        }
        UI.showStatus(msg, 'error');
    },

/* ------^-------
 *     /연결
 * ==============
 *    비밀번호
 * ------v------*/

    credentials(e) {
        // FIXME: handle more types

        document.getElementById("noVNC_username_block").classList.remove("noVNC_hidden");
        document.getElementById("noVNC_password_block").classList.remove("noVNC_hidden");

        let inputFocus = "none";
        if (e.detail.types.indexOf("username") === -1) {
            document.getElementById("noVNC_username_block").classList.add("noVNC_hidden");
        } else {
            inputFocus = inputFocus === "none" ? "noVNC_username_input" : inputFocus;
        }
        if (e.detail.types.indexOf("password") === -1) {
            document.getElementById("noVNC_password_block").classList.add("noVNC_hidden");
        } else {
            inputFocus = inputFocus === "none" ? "noVNC_password_input" : inputFocus;
        }
        document.getElementById('noVNC_credentials_dlg')
            .classList.add('noVNC_open');

        setTimeout(() => document
            .getElementById(inputFocus).focus(), 100);

        Log.Warn("Server asked for credentials");
        UI.showStatus(_("Credentials are required"), "warning");
    },

    setCredentials(e) {
        // Prevent actually submitting the form
        e.preventDefault();

        let inputElemUsername = document.getElementById('noVNC_username_input');
        const username = inputElemUsername.value;

        let inputElemPassword = document.getElementById('noVNC_password_input');
        const password = inputElemPassword.value;
        // Clear the input after reading the password
        inputElemPassword.value = "";

        UI.rfb.sendCredentials({ username: username, password: password });
        UI.reconnectPassword = password;
        document.getElementById('noVNC_credentials_dlg')
            .classList.remove('noVNC_open');
    },

/* ------^-------
 *  /비밀번호
 * ==============
 *   풀스크린
 * ------v------*/

    toggleFullscreen() {
        if (document.fullscreenElement || // alternative standard method
            document.mozFullScreenElement || // currently working methods
            document.webkitFullscreenElement ||
            document.msFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        } else {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen();
            } else if (document.documentElement.mozRequestFullScreen) {
                document.documentElement.mozRequestFullScreen();
            } else if (document.documentElement.webkitRequestFullscreen) {
                document.documentElement.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT);
            } else if (document.body.msRequestFullscreen) {
                document.body.msRequestFullscreen();
            }
        }
        UI.updateFullscreenButton();
    },

    updateFullscreenButton() {
        if (document.fullscreenElement || // alternative standard method
            document.mozFullScreenElement || // currently working methods
            document.webkitFullscreenElement ||
            document.msFullscreenElement ) {
            document.getElementById('noVNC_fullscreen_button')
                .classList.add("noVNC_selected");
        } else {
            document.getElementById('noVNC_fullscreen_button')
                .classList.remove("noVNC_selected");
        }
    },

/* ------^-------
 *  /풀스크린
 * ==============
 *    사이즈 조정
 * ------v------*/

    // Apply remote resizing or local scaling
    applyResizeMode() {
        if (!UI.rfb) return;

        UI.rfb.scaleViewport = UI.getSetting('resize') === 'scale';
        UI.rfb.resizeSession = UI.getSetting('resize') === 'remote';
    },

/* ------^-------
 *   /사이즈 조정
 * ==============
 * VIEW CLIPPING
 * ------v------*/

    // Update viewport clipping property for the connection. The normal
    // case is to get the value from the setting. There are special cases
    // for when the viewport is scaled or when a touch device is used.
    updateViewClip() {
        if (!UI.rfb) return;

        const scaling = UI.getSetting('resize') === 'scale';

        if (scaling) {
            // Can't be clipping if viewport is scaled to fit
            UI.forceSetting('view_clip', false);
            UI.rfb.clipViewport  = false;
        } else if (!hasScrollbarGutter) {
            // Some platforms have scrollbars that are difficult
            // to use in our case, so we always use our own panning
            UI.forceSetting('view_clip', true);
            UI.rfb.clipViewport = true;
        } else {
            UI.enableSetting('view_clip');
            UI.rfb.clipViewport = UI.getSetting('view_clip');
        }

        // Changing the viewport may change the state of
        // the dragging button
        UI.updateViewDrag();
    },

/* ------^-------
 * /VIEW CLIPPING
 * ==============
 *    VIEWDRAG
 * ------v------*/

    // 드래그 조작모드 변경
    toggleDragMode() {
        if (!UI.rfb) return;

        UI.rfb.dragMode = !UI.rfb.dragMode;
        UI.updateDragMode();
    },

    updateDragMode() {
        if (!UI.connected) return;

        const viewDragButton = document.getElementById('drag_mode');

        viewDragButton.innerText = (UI.rfb.dragMode) ? '✋' : '✊';
    },

    // 드래그 조작모드 기존 코드
    toggleViewDrag() {
        if (!UI.rfb) return;

        UI.rfb.dragViewport = !UI.rfb.dragViewport;
        UI.rfb.dragMode = !UI.rfb.dragMode;
        UI.updateViewDrag();
    },

    updateViewDrag() {
        if (!UI.connected) return;

        const viewDragButton = document.getElementById('noVNC_view_drag_button');

        if (!UI.rfb.clipViewport && UI.rfb.dragViewport) {
            // We are no longer clipping the viewport. Make sure
            // viewport drag isn't active when it can't be used.
            UI.rfb.dragViewport = false;
        }

        if (UI.rfb.dragViewport) {
            viewDragButton.classList.add("noVNC_selected");
        } else {
            viewDragButton.classList.remove("noVNC_selected");
        }

        if (UI.rfb.clipViewport) {
            viewDragButton.classList.remove("noVNC_hidden");
        } else {
            viewDragButton.classList.add("noVNC_hidden");
        }
    },


/* ------^-------
 *   /VIEWDRAG
 * ==============
 *    QUALITY
 * ------v------*/

    updateQuality() {
        if (!UI.rfb) return;

        UI.rfb.qualityLevel = parseInt(UI.getSetting('quality'));
    },

/* ------^-------
 *   /QUALITY
 * ==============
 *  COMPRESSION
 * ------v------*/

    updateCompression() {
        if (!UI.rfb) return;

        UI.rfb.compressionLevel = parseInt(UI.getSetting('compression'));
    },

/* ------^-------
 *  /COMPRESSION
 * ==============
 *    KEYBOARD
 * ------v------*/

    showVirtualKeyboard() {
        if (!isTouchDevice) return;

        const input = document.getElementById('noVNC_keyboardinput');

        if (document.activeElement == input) return;

        input.value = "";
        input.length = 0;
        input.focus();

        // 한영 초기 체크 초기화
        UI.lastLang = '';

        try {
            const l = input.value.length;
            // Move the caret to the end
            input.setSelectionRange(l, l);
        } catch (err) {
            // setSelectionRange is undefined in Google Chrome
        }
    },

    hideVirtualKeyboard() {
        if (!isTouchDevice) return;

        const input = document.getElementById('noVNC_keyboardinput');

        if (document.activeElement != input) return;

        input.blur();
    },

    toggleVirtualKeyboard() {
        if (document.getElementById('noVNC_keyboard_button')
            .classList.contains("noVNC_selected")) {
            UI.hideVirtualKeyboard();
        } else {
            UI.showVirtualKeyboard();
        }
        
        UI.rfb.virtualKeyboardOn = document.getElementById('noVNC_keyboard_button')
                                     .classList.contains("noVNC_selected");
    },

    onfocusVirtualKeyboard(event) {
        document.getElementById('noVNC_keyboard_button')
            .classList.add("noVNC_selected");
        if (UI.rfb) {
            UI.rfb.focusOnClick = false;
        }
    },

    onblurVirtualKeyboard(event) {
        document.getElementById('noVNC_keyboard_button')
            .classList.remove("noVNC_selected");
        if (UI.rfb) {
            UI.rfb.focusOnClick = true;
        }
    },

    keepVirtualKeyboard(event) {
        const input = document.getElementById('noVNC_keyboardinput');

        // Only prevent focus change if the virtual keyboard is active
        if (document.activeElement != input) {
            return;
        }

        // Only allow focus to move to other elements that need
        // focus to function properly
        if (event.target.form !== undefined) {
            switch (event.target.type) {
                case 'text':
                case 'email':
                case 'search':
                case 'password':
                case 'tel':
                case 'url':
                case 'textarea':
                case 'select-one':
                case 'select-multiple':
                    return;
            }
        }

        event.preventDefault();
    },

    keyboardinputReset() {
        const kbi = document.getElementById('noVNC_keyboardinput');
        kbi.value = new Array(UI.defaultKeyboardinputLen).join("_");
        UI.lastKeyboardinput = kbi.value;
    },

    keyEvent(keysym, code, down) {
        
        if (!UI.rfb) return;
        
        // platform 형식의 문자가 들어가는 경우
        // IOS의 한글 형식이기 때문에
        // 이벤트 입력에 알맞게 변경해줘야 한다.
        if(code.indexOf('Platform') !== -1) {
            code = parseInt(code.replace('Platform', ''));  
            const keyInfo = UI.langMapping(code);
            keysym = keyInfo.keysym;
            code = keyInfo.code;

            UI.langChange(keyInfo.langType);
        } 

        // 영문일 경우에도 한영 변환에 신경써줘야 한다.
        if(code.indexOf('Key') !== -1) {
            const keyInfo = UI.langMapping(keysym);
            UI.langChange(keyInfo.langType);
        }

        // 한번 눌린 키는 떼기 전까지 계속해서 보내준다.
        // 단점 : (대문자 및 특수분자 입력을 제외한..)
        //       shift나 ctrl을 사용하는 모든 기능을 쓸수 없다. 
        if (UI.touchKeyboard.push_check(code)) {
            UI.rfb.sendKey(keysym, code);
        } else {
            UI.rfb.sendKey(keysym, code, down);
        }
    },

    // When normal keyboard events are left uncought, use the input events from
    // the keyboardinput element instead and generate the corresponding key events.
    // This code is required since some browsers on Android are inconsistent in
    // sending keyCodes in the normal keyboard events when using on screen keyboards.
    keyInput(event) {
        if (!UI.rfb) return;

        // 한글자씩 키 이벤트로 보내는 방식
        const newValue = event.target.value;

        const ch = newValue.charAt(0);

        event.target.value = "";
        
        const keyInfo = UI.langMapping(ch);

        UI.langChange(keyInfo.langType)
        UI.sendKey(keyInfo.keysym, "key" + keyInfo.code);
    },

    // 한영 타입 변환을 수행
    langChange(langType) {      
        if(UI.lastLang !== langType) {
            if(langType === 'kor') {
                UI.sendKeys(EVENT_LANG_KOR, true);
                UI.sendKeys(EVENT_LANG_KOR, false);
            } else {
                UI.sendKeys(EVENT_LANG_ENG, true);
                UI.sendKeys(EVENT_LANG_ENG, false);
            }
            UI.lastLang = langType;
        }
    },

    // 터치에서 입력된 값을 서버로 알맞게 전송하기 위해 매핑
    langMapping(keyCode) {
        // 유니코드를 문자로 변환
        if(typeof(keyCode) === 'number') {
            keyCode = String.fromCharCode(keyCode);
        } 

        let _keysym, _langType;
        // 만약 한글일 경우 영문으로 매핑
        if(KorKeyTable[keyCode] !== undefined) {
            _keysym = KorKeyTable[keyCode].charCodeAt(0);
            _langType = 'kor';
        } else {
            _keysym = keyCode.charCodeAt(0);
            _langType = 'eng';
        }

        return {
            keysym : _keysym,
            code : String.fromCharCode(_keysym),
            langType : _langType
        };
    },

/* ------^-------
 *   /KEYBOARD
 * ==============
 *   EXTRA KEYS
 * ------v------*/

    openExtraKeys() {
        UI.closeAllPanels();
        UI.openControlbar();

        document.getElementById('noVNC_modifiers')
            .classList.add("noVNC_open");
        document.getElementById('noVNC_toggle_extra_keys_button')
            .classList.add("noVNC_selected");
    },

    closeExtraKeys() {
        document.getElementById('noVNC_modifiers')
            .classList.remove("noVNC_open");
        document.getElementById('noVNC_toggle_extra_keys_button')
            .classList.remove("noVNC_selected");
    },

    toggleExtraKeys() {
        if (document.getElementById('noVNC_modifiers')
            .classList.contains("noVNC_open")) {
            UI.closeExtraKeys();
        } else  {
            UI.openExtraKeys();
        }
    },

    sendEsc() {
        UI.sendKey(KeyTable.XK_Escape, "Escape");
    },

    sendTab() {
        UI.sendKey(KeyTable.XK_Tab, "Tab");
    },

    toggleCtrl() {
        const btn = document.getElementById('noVNC_toggle_ctrl_button');
        if (btn.classList.contains("noVNC_selected")) {
            UI.sendKey(KeyTable.XK_Control_L, "ControlLeft", false);
            btn.classList.remove("noVNC_selected");
        } else {
            UI.sendKey(KeyTable.XK_Control_L, "ControlLeft", true);
            btn.classList.add("noVNC_selected");
        }
    },

    toggleWindows() {
        const btn = document.getElementById('noVNC_toggle_windows_button');
        if (btn.classList.contains("noVNC_selected")) {
            UI.sendKey(KeyTable.XK_Super_L, "MetaLeft", false);
            btn.classList.remove("noVNC_selected");
        } else {
            UI.sendKey(KeyTable.XK_Super_L, "MetaLeft", true);
            btn.classList.add("noVNC_selected");
        }
    },

    toggleAlt() {
        const btn = document.getElementById('noVNC_toggle_alt_button');
        if (btn.classList.contains("noVNC_selected")) {
            UI.sendKey(KeyTable.XK_Alt_L, "AltLeft", false);
            btn.classList.remove("noVNC_selected");
        } else {
            UI.sendKey(KeyTable.XK_Alt_L, "AltLeft", true);
            btn.classList.add("noVNC_selected");
        }
    },

    sendCtrlAltDel() {
        UI.rfb.sendCtrlAltDel();
        // See below
        UI.rfb.focus();
        UI.idleControlbar();
    },

    sendKey(keysym, code, down) {
        UI.rfb.sendKey(keysym, code, down);

        // Move focus to the screen in order to be able to use the
        // keyboard right after these extra keys.
        // The exception is when a virtual keyboard is used, because
        // if we focus the screen the virtual keyboard would be closed.
        // In this case we focus our special virtual keyboard input
        // element instead.
        if (document.getElementById('noVNC_keyboard_button')
            .classList.contains("noVNC_selected")) {
            document.getElementById('noVNC_keyboardinput').focus();
        } else {
            UI.rfb.focus();
        }
        // fade out the controlbar to highlight that
        // the focus has been moved to the screen
        UI.idleControlbar();
    },

    // 키조합을 한번에 보낼 수 있게 구성한 함수
    sendKeys(events, down = undefined) {
        if(down === undefined) {
            events.forEach(e => {
                UI.rfb.sendKey(e.keysym, e.code);
            });
        } else {
            events.forEach(e => {
                UI.rfb.sendKey(e.keysym, e.code, down);
            });
        }
    },

/* ------^-------
 *   /EXTRA KEYS
 * ==============
 *     MISC
 * ------v------*/

    // 화면만 보여준다.
    updateViewOnly() {
        if (!UI.rfb) return;
        
        UI.rfb.viewOnly = UI.getSetting('view_only');
        
        // Hide input related buttons in view only mode
        if (UI.rfb.viewOnly) {
            document.getElementById('noVNC_keyboard_button')
                .classList.add('noVNC_hidden');
            document.getElementById('noVNC_toggle_extra_keys_button')
                .classList.add('noVNC_hidden');
            document.getElementById('noVNC_clipboard_button')
                .classList.add('noVNC_hidden');
        } else {
            document.getElementById('noVNC_keyboard_button')
                .classList.remove('noVNC_hidden');
            // document.getElementById('noVNC_toggle_extra_keys_button')
            //     .classList.remove('noVNC_hidden');
            // document.getElementById('noVNC_clipboard_button')
            //     .classList.remove('noVNC_hidden');
        }
    },

    updateShowDotCursor() {
        if (!UI.rfb) return;
        UI.rfb.showDotCursor = UI.getSetting('show_dot');
    },

    updateLogging() {
        WebUtil.initLogging(UI.getSetting('logging'));
    },

    updateDesktopName(e) {
        UI.desktopName = e.detail.name;
        // Display the desktop name in the document title
        document.title = e.detail.name + " - " + PAGE_TITLE;
    },

    bell(e) {
        if (WebUtil.getConfigVar('bell', 'on') === 'on') {
            const promise = document.getElementById('noVNC_bell').play();
            // The standards disagree on the return value here
            if (promise) {
                promise.catch((e) => {
                    if (e.name === "NotAllowedError") {
                        // Ignore when the browser doesn't let us play audio.
                        // It is common that the browsers require audio to be
                        // initiated from a user action.
                    } else {
                        Log.Error("Unable to play bell: " + e);
                    }
                });
            }
        }
    },

    //Helper to add options to dropdown.
    addOption(selectbox, text, value) {
        const optn = document.createElement("OPTION");
        optn.text = text;
        optn.value = value;
        selectbox.options.add(optn);
    },

/* ------^-------
 *    /MISC
 * ==============
 */

/* ------^-------
 *   /사용자 추가 함수
 * ==============
 *   EXTRA FUNCTION
 * ------v------*/

// 웹 공유 화면 캔버스에 띄워줄 메뉴를 미리 세팅한다.
// 이 세팅된 엘리먼트는 rfb에 screen_container div 아래에 붙는다
    make_menu(container) {
        const _menu_div = document.createElement('div');
    
        // 페이지 뒤로 가기
        const _back = document.createElement('button');
        _back.className = 'button__control';
        _back.id = 'back';
        _back.innerText = '⏪';
        _back.addEventListener('click', () => {
            UI.sendKeys(EVENT_PAGE_BACK, true);
            UI.sendKeys(EVENT_PAGE_BACK, false);
        });
        _menu_div.appendChild(_back);

        // 페이지 앞으로 가기
        const _front = document.createElement('button');
        _front.className = 'button__control';
        _front.id = 'front';
        _front.innerText = '⏩';
        _front.addEventListener('click', () => {
            UI.sendKeys(EVENT_PAGE_FRONT, true);
            UI.sendKeys(EVENT_PAGE_FRONT, false);
        });
        _menu_div.appendChild(_front);

        // 새로고침
        const _refresh = document.createElement('button');
        _refresh.className = 'button__control';
        _refresh.id = 'refresh';
        _refresh.innerText = '🔄';
        _refresh.addEventListener('click', () => {
            UI.sendKeys(EVENT_PAGE_REFRESH);
        });
        _menu_div.appendChild(_refresh);

        // 터치 가능 디바이스만 해당하는 메뉴
        if(isTouchDevice) {
            // 터치 키보드 모드
            const _virtual_key = document.createElement('button');
            _virtual_key.className = 'button__control';
            _virtual_key.id = 'virtual_key';
            _virtual_key.innerText = '⌨'; 
            _virtual_key.addEventListener('click', UI.toggleVirtualKeyboard);
            _menu_div.appendChild(_virtual_key);

            // 드래그 모드
            const _drag_mode = document.createElement('button');
            _drag_mode.className = 'button__control';
            _drag_mode.id = 'drag_mode';
            _drag_mode.innerText = '✋';
            _drag_mode.addEventListener('click', UI.toggleDragMode);
            _menu_div.appendChild(_drag_mode);
        }

        container.appendChild(_menu_div);
    },

    // 윈도우 이벤트가 발생했을때 하는 처리
    addWindowHandlers() {
        // 터치 디바이스일 경우에만 해당되는 이벤트처리
        if(isTouchDevice) {
            window.addEventListener('resize', UI.checkVirtualKeyboard);
        }
    },

    // 윈도우 사이즈 변경에 따른 터치 키보드 처리
    checkVirtualKeyboard(event) {

        const curWinSize = { width: window.outerWidth, height: window.outerHeight };
        // 키보드가 활성화 되어 있는 상태에서만 수행
        if (document.getElementById('noVNC_keyboard_button')
            .classList.contains("noVNC_selected")) {
    
            if (UI.lastWinSize.width === curWinSize.width &&
                UI.lastWinSize.height < curWinSize.height) {
                // 세로 길이만 바뀐 경우 ==> 키보드 닫음
               UI.toggleVirtualKeyboard();
            }
        }

        UI.lastWinSize.width = curWinSize.width;
        UI.lastWinSize.height = curWinSize.height;
    }

};

// 번역 셋업
const LINGUAS = ["cs", "de", "el", "es", "ja", "ko", "nl", "pl", "pt_BR", "ru", "sv", "tr", "zh_CN", "zh_TW"];
l10n.setup(LINGUAS);
if (l10n.language === "en" || l10n.dictionary !== undefined) {
    UI.prime();
} else {
    fetch('app/locale/' + l10n.language + '.json')
        .then((response) => {
            if (!response.ok) {
                throw Error("" + response.status + " " + response.statusText);
            }
            return response.json();
        })
        .then((translations) => { l10n.dictionary = translations; })
        .catch(err => Log.Error("Failed to load translations: " + err))
        .then(UI.prime);
}

export default UI;
