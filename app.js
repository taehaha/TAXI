/* Library */
const express = require('express');
const query = require('./lib/query');

const app = express();

/* Middle Ware */
const session = require('express-session');
const bodyParser = require('body-parser');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const flash = require('connect-flash');

/* Middle Ware Apply */
app.set('view engine', 'ejs'); //view engine ejs apply

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.use(session({ //session apply
    secret            : 'thisismysecret',
    resave            : false,
    saveUninitialized : true,
    cookie            : {maxAge : 1000 * 60 * 60, secure: false} //secure은 https 적용시 true로 변경하기
}));

app.use(passport.initialize());
app.use(passport.session()); //passport 세션 연동
app.use(flash()); //flash메세지 연동

/* Router */
const ajaxRouter = require('./routes/ajax');
const authRouter = require('./routes/auth');

app.use('/ajax', ajaxRouter);
app.use('/auth', authRouter);


//Static Services
app.use('/css',express.static('./css'));
app.use('/js', express.static('./js'));
app.use('/image', express.static('./images'));
app.use('/font', express.static('./font'));

app.get('/', (req, res, next) => {
    let userId;
    if(req.user) { //로그인 여부 확인
        userId = req.user.userId;
    }
    query.get_route_list((err, routeList) => {
        if(!err) {
            res.render('route_list', {userNo: userId, routeList: routeList});
        }
    });
});

//POSTLIST 페이지
app.get('/route/:routeNumber/postlist/', (req, res, next) => {
    let userId;
    if(req.user) {
        userId = req.user.userId;
    }
    let routeId = req.params.routeNumber //시멘틱 URL 파싱
    let date = req.query.date;

    if(!date) { //get 데이터 없을 경우 오늘 날짜로 변경
        date = new Date().toISOString().split('T')[0];
    }

    //모집글 리스트 가져오기
    query.get_post_list(routeId, date, (err, postList) => {
        if(err) {
            console.error("Postlist Error : get_post_list Error");
            next(err);
            return;
        }
        res.render('post_list', {userNo: userId, routeNo: routeId, postList});
    });
});

//post 페이지
app.get('/route/:routeNumber/post/:postNumber', (req, res, next) => {
    if(!req.user) { //로그인 체크
        req.session.callbackUrl = req.originalUrl;
        res.redirect("/auth/login");
        return;
    }
    let user = req.user;
    let post = new query.Post(req.params.postNumber);

    //template에 넘겨줄 데이터들
    let isAttended;
    let isOwner;
    let attenders = [];
    let departure;
    let destination;
    let time;
    let specificLoc;

    //모집글 데이터 얻기
    post.get_data((err, postData) => {
        if(err) {
            next(err);
            return;
        }

        //게시글 주인인지 확인
        isOwner = false;
        if(user.userId === postData['owner_user_no']) {
            isOwner = true;
        }
        
        time = postData['reservation_time'];
        specificLoc = postData['specific_loc'];
        //참가자 이름 얻기
        post.get_attender((err, data) => {
            if(err) {
                next(err);
                return;
            }
            isAttended = false;
            for(let i = 0; i < data.length; i++ ) {
                if(user.userId === data[i]['attender_user_no']) {
                    isAttended = true;
                }
                attenders.push(data[i]['attender_user_name']);
            }
            //출발지 도착지 얻기
            query.get_route_data(post.routeId, (err, routeData) => {
                if(err) {
                    next(err);
                    return;
                }
                console.log(routeData);
                departure = routeData['departure_name'];
                destination = routeData['destination_name'];
                
                let data = {
                    userNo: user.userId,
                    postNo: post.postId,
                    isAttended: isAttended,
                    isOwner: isOwner,
                    attenders: attenders,
                    departure: departure,
                    destination: destination,
                    time: time,
                    specificLoc: specificLoc
                }
                res.render('post', data);
            });
        }); 
    });
});

//POST 참가 프로세스
app.get('/route/:routeNumber/post/:postNumber/attend', (req, res, next) => {
    if(!req.user) { //로그인 체크
        res.redirect("/auth/login");
        return;
    }
    let user = req.user; //TODO req.user에 User 객체를 직접 넣도록 변경
    let post = new query.Post(req.params.postNumber);

    user.get_userData((err, userData) => {
        let username = userData['username'];

        post.set_attender(user.userId, username, (err, result) => {
            if(err) {
                next(err);
                return;
            }
            else if(result === true) {
                console.log("true use flash");
            }
            else if(result === false) {
                console.log("false use flash");
            }
            res.redirect(`../${post.postId}`);
        });
    });
});

//POST 참가 취소 프로세스
app.get('/route/:routeNumber/post/:postNumber/attend_cancel', (req, res, next) => {
    if(!req.user) { //로그인 체크
        res.redirect("/auth/login");
        return;
    }

    let user = req.user;
    let post = new query.Post(req.params.postNumber);

    post.del_attender(user.userId, (err, result) => {
        if(err) {
            next(err);
            return;
        }
        else if(result === true) {
            console.log("true use flash at attend_cancel");
        }
        else if(result === false) {
            console.log("false use flash at attend_cancel");
        }
        res.redirect(`../${post.postId}`);
    });
});


//POST 생성 페이지
app.get('/route/:routeNumber/write', (req, res, next) => {
    if(!req.user) { //로그인 체크
        req.session.callbackUrl = req.originalUrl;
        res.redirect("/auth/login");
        return;
    }

    let routeNo = req.params.routeNumber;
    res.render('post_write',{routeNo: routeNo});
});

//POST 생성 프로세스
app.post('/route/:routeNumber/write/process', (req, res, next) => {
    if(!req.user) { //로그인 체크
        res.redirect("/auth/login");
        return;
    }

    let user = req.user;
    let routeId = req.params.routeNumber;
    let specificLoc = req.body.specific_loc;
    let date = req.body.date;
    let time = req.body.time;

    if(date === '' || time === '') { //date나 time 입력값이 없을경우 새로고침
        res.redirect(`/route/${routeId}/write`);
        return;
    }

    //post 생성
    user.set_post(routeId, specificLoc, date, time, (err, postData) => {
        if(err) {
            next(err);
            return;
        }
        let post = new query.Post(postData.postId);
        //소유주 attender에 추가
        post.set_attender(user.userId, postData.ownerName ,(_err, _result) => {
            if(_err) {
                next(_err);
                return;
            }
            res.redirect(`/route/${routeId}/postlist?date=${date}`);
        });
    });
});

//POST 삭제
app.get('/route/:routeNumber/post/:postNumber/delete', (req, res, next) => {
    if(!req.user) { //로그인 체크
        res.redirect("/auth/login");
    }
    
    //객체들
    let user = req.user;
    let post = new query.Post(req.params.postNumber);
    
    let routeId = req.params.routeNumber;
    let postId = req.params.postNumber;

    //로그인한 계정 이름과 POST 소유주 이름과 일치 확인
    post.get_data((err, postData) => {
        if(err || !postData) {
            next(err);
            return;
        }
        let ownerId = postData['owner_user_no'];
        if(ownerId !== user.userId) { //소유주가 일치하지 않을 경우
            res.redirect(`../${postId}`);
            return;
        }

        post.delete((_err, _result) => {
            if(_err) {
                next(_err);
                return;
            }
            else if(_result === true) {
                console.log("true use flash at delete");
            }
            else if(_result === false) {
                console.log("false use flash at delete");
            }
            res.redirect(`/route/${routeId}/postlist`);
        });
    });
});

//에러 발생시 실행. next(err);로 이리 올 수 있음
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Error occured!');
});

app.use((req, res, next) => {
    res.status(400).send('Cant find this path!');
});

app.listen(3000, () => console.log("ride_togather node.js Server Running at 3000."));