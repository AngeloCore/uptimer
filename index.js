const express = require('express');
const app = express();
const ms = require('ms');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config.json');
const morgan = require('morgan');
const db = require('quick.db');

/* ------------------------------- */
const up = require('web-uptimer');
const uptimer = new up.Uptimer({ timeout: ms('5m'), client: 'got', pingLog: true }); //uptimer | NOTE: If you don't want spam in the console remove 'pingLog: true'
/* ------------------------------- */

const views = path.resolve(`${process.cwd()}${path.sep}views`);

const passport = require('passport');
const session = require('express-session');
const Strategy = require('passport-discord').Strategy;

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

let protocol = config.protocol;
let callback = protocol + config.domain + '/callback';

console.log('[INFO]', `Callback URL: ${callback}`);

passport.use(new Strategy({
  clientID: config.login.id,
  clientSecret: config.login.secret,
  callbackURL: callback,
  scope: ['identify']
},
  (accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
  }));

app.use(session({
  secret: "PASSWORDTHINGIDK",
  resave: false,
  saveUninitialized: false,
}));

app.use(passport.initialize());
app.use(passport.session());

app.locals.domain = config.domain;

app.set('trust proxy', 5);
app.use('/public', express.static(path.resolve(`${process.cwd()}${path.sep}public`), { maxAge: '1m' }));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(morgan('combined'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  req.session.backURL = req.url;
  res.redirect('/login');
}

app.get('/', (req, res) => {
  res.redirect('/add');
})

app.get('/add', checkAuth, async (req, res) => {
  res.render(path.resolve(`${views}${path.sep}add.ejs`), {
    config: config,
    auth: req.isAuthenticated() || false,
    user: req.user || null,
  });
});

app.get('/remove', checkAuth, async (req, res) => {

  let all = await uptimer.allById(req.user.id);

  res.render(path.resolve(`${views}${path.sep}remove.ejs`), {
    config: config,
    auth: req.isAuthenticated() || false,
    user: req.user || null,
    all: all
  })
});

app.post('/api/post', async (req, res) => {

  if (!req.body.url) {
    return res.json({ success: false, message: "Please, provide an URL" })
  }

  if (!req.body.author) {
    return res.json({ success: false, message: "Please, provide an ID" })
  }

  uptimer.add(req.body.url, req.body.author.toString())
    .then(() => {
      res.json({ success: true });
    })
    .catch(e => {
      return res.json({ success: false, message: e.toString() })
    });

  uptimer.restart(req.body.author.toString());

});

app.post('/api/delete', async (req, res) => {

  if (!req.body.url) {
    return res.json({ success: false, message: "Please, provide an URL" })
  }

  uptimer.substring(req.body.url, req.body.author.toString())
    .then(() => {
      res.json({ success: true });
    })
    .catch(e => {
      return res.json({ success: false, message: e.toString() })
    });

  uptimer.restart(req.body.author.toString());

});

app.get('/login', (req, res, next) => {

  if (req.session.backURL) {

    req.session.backURL = req.session.backURL;

  } else if (req.headers.referer) {

    const parsed = req.headers.referer;

    if (parsed.hostname === app.locals.domain) {
      req.session.backURL = parsed.path;
    }

  } else {

    req.session.backURL = '/add';
  }

  next();

},
  passport.authenticate('discord'));

app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {

  if (req.session.backURL) {

    if (req.session.backURL === `${config.protocol}${config.domain}`) {

      res.redirect(`${config.protocol}${config.domain}/`)

    } else {
      res.redirect(req.session.backURL);
      req.session.backURL = null;
    }

  } else {
    res.redirect('/add');
  }
});

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/');
});

app.listen('8824', function() {
  console.log('[INFO]', `Website runned`);
  uptimer.startAll().then(s => console.log('[INFO]', `Uptiming: ${s ? 'Yes' : 'No, Error' }`))
})
