
// express 모듈을 가지고 온다.
const express = require('express');
// 쉘 실행용 라이브러리
const shell = require('shelljs');

// 새로운 함수를 만들어 app에 저장
const app = express();
// 백서버
const PORT = 3000;
const X11_PORT = 50000;

const webshare_dir = '/usr/webshare/release';

// 추출된 변수를 이용해 쉘을 실행 시키는 함수 
function run(port, url, width, height) {
    shell.exec(`bash ${webshare_dir}/x11_start.sh -p ${port} -u ${url} -r ${width}x${height}`, { async: true });
}
function kill(port) {
    shell.exec(`bash ${webshare_dir}/x11_kill.sh -p ${port}`, { async: true });
}
function clean() {
    shell.exec(`bash ${webshare_dir}/x11_clean.sh`, { async: true });
}

// 사용할 변수를 추출하는 함수
function extract(request) {
    // 쿼리 스트링을 가지고 온다.
    const port = request.query.port;
    const todo = request.query.todo;
    const url = request.query.url;
    const display = port - X11_PORT;

    const width = request.query.width;
    const height = request.query.height;

    return {
        port,
        todo,
        url,
        display,
        width, height
    };
}

// 요청받은 url 처리
app.get('/create', (req, res) => {
    console.log("get");
    const obj = extract(req);
    run(obj.port, obj.url, obj.width, obj.height);
    res.send("finished!");
});

app.get('/kill', (req, res) => {
    console.log("get");
    const obj = extract(req);
    kill(obj.port);
    res.send("finished!");
});

app.get('/clean', (req, res) => {
    console.log("get");
    const obj = extract(req);
    clean();
    res.send("finished!");
});

// 쉘 실행
app.listen(PORT, () => {
    console.log(`Start server with listening port ${PORT}`);
});

