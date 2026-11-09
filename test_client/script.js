const connect_button = document.getElementById('connect');
const disconnect_button = document.getElementById('disconnect');
const screen = document.getElementById('screen');
const doc_web_url = document.getElementById('web_url');
const width = document.getElementById('width');
const height = document.getElementById('height');

let temp_server_ip, temp_port, temp_client_id;

let api = undefined;

connect_button.onclick = function() {

    // parameter 가져오기
    const server_ip = document.getElementById('server_ip').value;
    const port = document.getElementById('port').value;
    const client_id = document.getElementById('client_id').value;

    // 하나라도 값이 없으면 리턴
    if(server_ip === "" || port === "" || 
       client_id === "" || doc_web_url.value === "") {
           alert("input parameter error!");
           return -1;
        }

    temp_server_ip = server_ip;
    temp_port = port;
    temp_client_id = client_id;
    

    api = new web_share(server_ip, client_id, 'host');

    if(api.connect_leader(screen, doc_web_url.value, width.value, height.value)) {
        connect_button.disabled = true;
        disconnect_button.disabled = false;
    }

    return 0;
}

disconnect_button.onclick = function() {

    if(api.disconnect(screen)) {
        disconnect_button.disabled = true;
        connect_button.disabled = false;
    }

    
    return 0;
}

