const MIN_WIDTH = 0;
const MAX_WIDTH = 1920;
const MIN_HEIGHT = 0;
const MAX_HEIGHT = 1920;

class Webshare {

    constructor(serverUrl, roomID, userType) {
        this.ip = serverUrl;
        this.id = roomID;
        this.userType = userType;

        this.baseUrl = 
            `https://${serverUrl}/webshare`;
    }

    // =================================================== //
    //                       PUBLIC                        //
    // =================================================== //
    
    /**
	 * 	@connectByLeader 
	 *	@description : 웹 공유 세션을 만들고자 하는 사람이 사용
	 */
    connectByLeader(screen, url, width, height) {
        if(!this.exceptionCheck('leader', screen, url, width, height))
            return false;

        this.isServerLeader()
        .then((msg) => {
            if(msg === 'true') {
                this.connectToUrl('leader', screen, url, width, height);
            } 
        });

        return true;
    }

    /**
	 * 	@connectByFollower 
	 *	@description : 웹 공유 중인 세션에 접속하고자 하는 사람이 사용
	 */
    connectByFollower(screen) {
        if(!this.exceptionCheck('follower', screen))
            return false;

        this.isServerFollewer()
        .then((msg) => {
            if(msg === 'true') {
                this.connectToUrl('follower', screen);
            } else if(msg === 'retry') {
                this.connectByFollower(screen);
            } 
        });

        return true;
    }

    /**
	 * 	@disconnect 
	 *	@description : 일반적인 세션 연결 종료, iframe을 통해 서비스 요청
	 */
    disconnect(screen) {
        if(!this.exceptionCheck()) 
            return false;

        const requestUrl = this.baseUrl + `/disconnect/${this.id}/${this.userType}`;
        screen.src = requestUrl;

        return true;
    }

    /**
	 * 	@disconnectNow 
	 *	@description : 특수한 세션 연결 종료, iframe이 없이 요청
	 */
    disconnectNow() {
        const requestUrl = this.baseUrl + `/disconnect/${this.id}/${this.userType}`;
        fetch(requestUrl)
        .then((res) => {
            console.log(res);
            return res;
        })
        .catch(err => {throw err});
    }

    /**
	 * 	@clear 
	 *	@description : 일반적인 세션 삭제, iframe을 통해 서비스 요청
	 */
    clear(screen) {
        if(!this.exceptionCheck()) 
            return false;

        const requestUrl = this.baseUrl + `/clear/${this.id}/${this.userType}`;
        screen.src = requestUrl;

        return true;
    }

    /**
	 * 	@clearNow 
	 *	@description : 특수한 세션 삭제, iframe이 없이 요청
	 */
    clearNow() {
        const requestUrl = this.baseUrl + `/clear/${this.id}/${this.userType}`;
        fetch(requestUrl)
        .then((res) => {
            console.log(res);
            return res;
        })
        .catch(err => {throw err});
    }

    /**
	 * 	@status 
	 *	@description : 현재 웹 공유 세션의 상태를 가져옴
	 */
    status() {
        if(!this.exceptionCheck()) 
            return;
	
        const requestUrl = this.baseUrl + `/status/${this.id}/${this.userType}`;
    
		return new Promise((resolve, reject) => {
			fetch(requestUrl)
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

    /**
	 * 	@isServerLeader 
	 *	@description : 세션의 상태를 통해 세션 생성자인지 확인
     *                 세션이 아직 생성되지 않은 상태라면 세션 생성자이다.
	 */
    isServerLeader() {
        return new Promise((resolve, reject) => {
            this.status()
            .then((sessionStatus) => {
                if(sessionStatus === 'free') {
                    resolve('true');
                } else {
                    resolve('false');
                }
            });
        });
    }

    /**
	 * 	@isServerFollewer 
	 *	@description : 세션의 상태를 통해 세션 접속자인지 확인
     *                 세션이 생성된 상태라면 세션 접속자이다.
     *                 세션이 생성되지 않았다면 다시 접속을 시도해야 한다.
	 */
    isServerFollewer() {
        return new Promise((resolve, reject) => {            
            this.status()
            .then((sessionStatus) => {
                if(sessionStatus === "using") {
                    resolve('true');
                } else if(sessionStatus === "free") {
                    resolve('retry');
                } else {
                    resolve('false');
                }
            });
        });
    }
    
    /**
	 * 	@connectToUrl 
	 *	@description : 웹 공유에 필요한 정보들을 바탕으로 세션을 생성한다.              
	 */
    connectToUrl(type, screen, url = undefined, width = 0, height = 0) {
        let requestUrl = this.baseUrl;
        if(type === 'leader') {
            requestUrl += `/connect/${this.id}/${this.userType}/${width}/${height}` 
                           + `?url=${url}`;
        } else {
            requestUrl += `/connect/${this.id}/${this.userType}`;
        }
        
        screen.src = requestUrl;
    }
    
    /**
	 * 	@exceptionCheck 
	 *	@description : 누락되거나 잘못된 값이 없는지 체크             
	 */
    exceptionCheck(type = 'none', screen = undefined, url = '', width = 0, height = 0) {

        // ip 주소
        const ipRegExp = /^([01]?\d\d?|2[0-4]\d|25[0-5])(\.([01]?\d\d?|2[0-4]\d|25[0-5])){3}$/;
        if(!ipRegExp.test(this.ip)) {
            alert('Error: wrong ip address!');
            return false;
        }

        if(type == 'none') {
            return true;
        }
        
        // iframe 화면
        if(screen === undefined || screen.tagName !== 'IFRAME') {
            alert('Error: wrong screen(iframe) element!');
            return false;
        }

        // 세션 생성
        if(type === 'leader') {
            // 시작 url
            const urlWithProtocolRegExp = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
            const urlRegExp = /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;
            if(!urlWithProtocolRegExp.test(url) && !urlRegExp.test(url)) {
                alert("Error: wrong url!");
                return false;
            }

            // 해상도
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