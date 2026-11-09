const SERVER_PORT = 8443;

//const MIN_WIDTH = 512;
//const MAX_WIDTH = 1920;
//const MIN_HEIGHT = 385;
//const MAX_HEIGHT = 1920;

const MIN_WIDTH = 0;
const MAX_WIDTH = 1920;
const MIN_HEIGHT = 0;
const MAX_HEIGHT = 1920;

class web_share {

    constructor(server_ip, room_id, user_type) {
        this.ip = server_ip;
        this.id = room_id;
        this.user_type = user_type;

        this.base_url = 
            `https://${server_ip}:${SERVER_PORT}/webshare`;
            // `https://${server_ip}/webshare`;
    }

    // =================================================== //
    //                       PUBLIC                        //
    // =================================================== //
    
    // 기본적인 연결
    // 연결 주체
    connect_leader(screen, url, width, height) {
        if(!this.exception_check('leader', screen, url, width, height))
            return false;

        this.check_server_leader()
        .then((msg) => {
            if(msg === 'true') {
                this.connect_url('leader', screen, url, width, height);
            } 
        });

        return true;
    }

    // 연결 대상
    connect_follower(screen) {
        if(!this.exception_check('follower', screen))
            return false;

        this.check_server_follewer()
        .then((msg) => {
            if(msg === 'true') {
                this.connect_url('follower', screen);
            } else if(msg === 'retry') {
                this.connect_follower(screen);
            } 
        });

        return true;
    }

    disconnect(screen) {
        if(!this.exception_check()) 
            return false;

        const request_url = this.base_url + `/disconnect/${this.id}/${this.user_type}`;
        screen.src = request_url;

        return true;
    }

    disconnect_now() {
        const request_url = this.base_url + `/disconnect/${this.id}/${this.user_type}`;
        fetch(request_url)
        .then((res) => {
            console.log(res);
            return res;
        })
        .catch(err => {throw err});
    }

    clear(screen) {
        if(!this.exception_check()) 
            return false;

        const request_url = this.base_url + `/clear/${this.id}/${this.user_type}`;
        screen.src = request_url;

        return true;
    }

    clear_now() {
        const request_url = this.base_url + `/clear/${this.id}/${this.user_type}`;
        fetch(request_url)
        .then((res) => {
            console.log(res);
            return res;
        })
        .catch(err => {throw err});
    }

    status() {
        if(!this.exception_check()) 
            return;
	
        const request_url = this.base_url + `/status/${this.id}/${this.user_type}`;
    
		return new Promise((resolve, reject) => {
			fetch(request_url)
	        .then(res => res.json())
	        .then((out) => {
	            resolve(out.status);
	        })
	        .catch(err => {throw err});
		});
    }


    // =================================================== //
    //                       PRIVATE                       //
    // =================================================== //

    // 세션 생성 주체가 서버를 사용할 수 있는지 검사
    check_server_leader() {
        return new Promise((resolve, reject) => {
            this.status()
            .then((result) => {
                if(result === 'free') {
                    resolve('true');
                } else {
                    resolve('false');
                }
            });
        });
    }

    // 연결 대상이 서버를 사용할 수 있는지 검사
    check_server_follewer() {
        return new Promise((resolve, reject) => {            
            this.status()
            .then((result) => {
                if(result === "using") {
                    resolve('true');
                } else if(result === "free") {
                    resolve('retry');
                } else {
                    resolve('false');
                }
            });
        });
    }
    
    connect_url(type, screen, url = undefined, width = 0, height = 0) {
        let request_url = this.base_url;
        if(type === 'leader') {
            request_url += `/connect/${this.id}/${this.user_type}/${width}/${height}` 
                           + `?url=${url}`;
        } else {
            request_url += `/connect/${this.id}/${this.user_type}`;
        }
        
        screen.src = request_url;
    }
    
    exception_check(type = 'none', screen = undefined, url = '', width = 0, height = 0) {

        // ip 주소 체크
        const ip_regExp = /^([01]?\d\d?|2[0-4]\d|25[0-5])(\.([01]?\d\d?|2[0-4]\d|25[0-5])){3}$/;
        if(!ip_regExp.test(this.ip)) {
            alert('Error: wrong ip address!');
            return false;
        }

        if(type == 'none') {
            return true;
        }
        
        // iframe 화면 체크
        if(screen === undefined || screen.tagName !== 'IFRAME') {
            alert('Error: wrong screen(iframe) element!');
            return false;
        }

        // 세션 생성시 체크
        if(type === 'leader') {
            // 시작 url 체크
            const url_with_protocol_regExp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
            const url_regExp = /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
            if(!url_with_protocol_regExp.test(url) && !url_regExp.test(url)) {
                alert("Error: wrong url!");
                return false;
            }

            // 해상도 체크 
            if(width < MIN_WIDTH || height < MIN_HEIGHT) {
                alert(`Error: resolution is too small! minimum resolution is (${MIN_WIDTH}x${MIN_HEIGHT}).`);
                return false;
            }
            if(width > MAX_WIDTH || height > MAX_HEIGHT) {
                alert(`Error: resolution is too big! maximum resolution is (${MAX_WIDTH}x${MAX_HEIGHT}).`);
                return false;
            }
        }
        
        return true;
    }
}