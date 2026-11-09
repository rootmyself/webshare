const start_button = document.getElementById('start');
const end_button = document.getElementById('end');
const screen_container = document.getElementById('screen_container');
const doc_web_url = document.getElementById('web_url');

const base_width = 95;
const base_height = 100;
let temp_server_ip, temp_port, temp_client_count, temp_start_id;

let apis = [];

start_button.onclick = function() {

    // parameter 가져오기
    const server_ip = document.getElementById('server_ip').value;
    const port = document.getElementById('port').value;
    const client_count = document.getElementById('client_count').value;
    const start_id = document.getElementById('start_id').value;

    // 하나라도 값이 없으면 리턴
    if(server_ip === "" || port === "" || 
       client_count === "" || doc_web_url.value === "" || 
       start_id === "") {
           alert("input parameter error!");
           return -1;
        }

    temp_server_ip = server_ip;
    temp_port = port;
    temp_client_count = client_count;
    temp_start_id = start_id;

    // 모든 자식 엘리먼트 삭제
    while(screen_container.hasChildNodes()) {
        screen_container.removeChild(screen_container.firstChild);
    }
    
    for(let i = 0; i < client_count; i++) {
        const iframe = document.createElement('iframe');


        const div_width = (client_count > 10 ? 10 : client_count);
        const div_height = (Math.trunc(client_count / 10) + 1);
        iframe.style.width = `${base_width / div_width}%`;
        iframe.style.height = `${base_height / div_height}%`;

        const id = i + Number(start_id);

        const total_width = screen_container.width;
        const total_height = screen_container.height;
        apis.push(new web_share(
                        server_ip, `screen_${id}`,'host'
                    ));
        
        apis[apis.length - 1].connect_leader(iframe, 'www.youtube.com', total_width, total_height);
        screen_container.appendChild(iframe);
    }
    // screen, url, width, height
    // apis.forEach(api => api.connect_leader());

    start_button.disabled = true;
    end_button.disabled = false;

    return 0;
}

end_button.onclick = function() {

    apis.forEach(api => api.disconnect());

    // clear
    apis = [];

    end_button.disabled = true;
    start_button.disabled = false;

    return 0;
}

