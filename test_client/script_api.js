const connect_button = document.getElementById('connect');
const disconnect_button = document.getElementById('disconnect');
const screen = document.getElementById('screen');
const web_url = document.getElementById('web_url');
const width = document.getElementById('width');
const height = document.getElementById('height');
const type = document.getElementById('view_mode');

const api = new web_share(
    '192.168.0.211', 'abc', screen, 'host', web_url
    );

connect_button.onclick = function() {

    api.width = width.value;
    api.height = height.value;

    if(!type.checked) {
        api.connect_leader();
    } else {
        api.connect_follower();
    }

    connect_button.disabled = true;
    disconnect_button.disabled = false;

    return 0;
}

disconnect_button.onclick = function() {

    api.disconnect();

    disconnect_button.disabled = true;
    connect_button.disabled = false;

    return 0;
}

