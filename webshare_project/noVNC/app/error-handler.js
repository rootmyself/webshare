/*
 * noVNC: HTML5 VNC client
 * Copyright (C) 2019 The noVNC Authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * See README.md for usage and integration instructions.
 */

// NB : 이 기능이 모듈에 포함되면 안됨. 
//      브라우저 네이티브 지원을 통해 오류 처리가 스크립트 로드 오류를 잡을 있다.

// 이 파일은 번역에 사용되므로 ES6을 사용할 수 없습니다.
/* eslint-disable prefer-arrow-callback */

(function _scope() {
    "use strict";

    // 잡히지 않은 에러들을 반환한다..
    function handleError(event, err) {
        try {
            const msg = document.getElementById('noVNC_fallback_errormsg');

            // 초기 오류만 표시
            if (msg.hasChildNodes()) {
                return false;
            }

            let div = document.createElement("div");
            div.classList.add('noVNC_message');
            div.appendChild(document.createTextNode(event.message));
            msg.appendChild(div);

            if (event.filename) {
                div = document.createElement("div");
                div.className = 'noVNC_location';
                let text = event.filename;
                if (event.lineno !== undefined) {
                    text += ":" + event.lineno;
                    if (event.colno !== undefined) {
                        text += ":" + event.colno;
                    }
                }
                div.appendChild(document.createTextNode(text));
                msg.appendChild(div);
            }

            if (err && err.stack) {
                div = document.createElement("div");
                div.className = 'noVNC_stack';
                div.appendChild(document.createTextNode(err.stack));
                msg.appendChild(div);
            }

            document.getElementById('noVNC_fallback_error')
                .classList.add("noVNC_open");
        } catch (exc) {
            document.write("noVNC encountered an error.");
        }
        // 오류가 브라우저 콘솔에 인쇄되는 것을 
        // 방지할 수 있으므로 true로 반환하지 마시오
        return false;
    }
    window.addEventListener('error', function onerror(evt) { handleError(evt, evt.error); });
    window.addEventListener('unhandledrejection', function onreject(evt) { handleError(evt.reason, evt.reason); });
})();
