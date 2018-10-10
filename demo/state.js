/*
 * routing: location events, history.state (restorable info);
 * models: some sort of tool for shared and non-shared models;
 * http-requests specific to APIs with related to authentication+authorization
 * TODO see if this leaks and how; tests; expand/fix
 * TODO 
 */
export const state = ({
	[Symbol.for('models')]: new WeakMap()
	,routing: function(self){
		// intercept clicks; derived from pwa-helper/router.js
		self.document.body.addEventListener('click', e => {
			if (e.defaultPrevented || e.button !== 0 ||
					e.metaKey || e.ctrlKey || e.shiftKey) return;

			const anchor = e.composedPath().find(n => n.tagName === 'A');
			if (!anchor || anchor.target ||
					anchor.hasAttribute('download') ||
					anchor.getAttribute('rel') === 'external') return;

			const href = anchor.href;
			if (!href || href.indexOf('mailto:') !== -1) return;

			const location = self.location;
			const origin = location.origin || location.protocol + '//' + location.host;
			if (href.indexOf(origin) !== 0) return;

			e.preventDefault();
			if (href !== location.href) {
				self.history.pushState({}, '', href);
				state.locationchange();
			}
		});
		// fix history methods so they update the document title (for bookmarks, history usability)
		self.history._pushState = self.history.pushState;
		self.history._replaceState = self.history.replaceState;
		self.history.pushState = function pushStateFix(state, title, url){
			if(title) self.document.title = title;
			return this._pushState(state, title, url);
		}
		self.history.replaceState = function replaceStateFix(state, title, url){
			if(title) self.document.title = title;
			return this._replaceState(state, title, url);
		}
		/* pass location to listeners as event.detail;
			convenience properties for:
		   	location.state (restorable state)
		   	location.history (manipulate state, etc as needed)
			location.urlHash or .url to use the desired URL.searchParams, URL.pathname, etc
		 */
		Object.defineProperties(self.location, {
			history: {
				get: function(){ return history }
			}
			,state: {
				get: function(){ return history.state }
			}
			,urlHash: {
				get: function(){ return new URL(location.hash.replace(/^#/,''), location.origin); }
			}
			,url: {
				get: function(){ return new URL(location, location.origin); }
			}
		});
		self.addEventListener('popstate', this.locationchange.bind(this));
	}
	,locationchange: function(){
		self.dispatchEvent(new CustomEvent('locationchange', {detail:self.location}));
	}
	,init: function(self){
		const models = this[Symbol.for('models')];
		if(!self.state){
			let data;
			Object.defineProperty(self, 'state', {value: this});

			data = new WeakMap();
			/* usage:
				window.addEventListener('model', (e)=>{
					console.log('this will show every global update:', e.detail);
				})
				window.addEventListener(`model-${ state.global.keyName }`, (e)=>{
					console.log(`show only ${ e.type } updates:`, e.detail);
				})
				state.global.keyName = {stuff: 'things'};
				=> events 'model' and 'model-keyName' dispatch
				window.dispatchEvent(new CustomEvent('modelupdate', {detail: {key: 'keyName', value: {stuff:'things'}}}));
				=> state.global.keyName.stuff === 'things' // true
				=> events 'model' and 'model-keyName' dispatch
			 */
			self.addEventListener('modelupdate', this.modelUpdate.bind(this));
			// provide a global model for sharing
			// it doesn't do much: no default, no remapping onto a new object or anything
			this.global = models.global = new Proxy(data, {
				get: function($, key){
					return $[key];
				}
				,set: function($, key, value){
					let current = $[key], detail;
					if(current === value) return true;
					$[key] = value;
					detail = {key, value};
					self.dispatchEvent(new CustomEvent('model', {detail}));
					self.dispatchEvent(new CustomEvent('model-'+key, {detail}));

					return true;
				}
			});

			this.routing(self);
			this.locationchange();
		};
		return this;
	}
	,modelUpdate: function(event){
		const models = this[Symbol.for('models')].global, detail = event.detail;
		models[ detail.key ] = detail.value;
	}
	,fetch: function(url='', req = {}, debug=this.global.debug){
		let jwt, pending, models = this[Symbol.for('models')];
		// TODO add method and params
		pending = models[ url ];
		if(pending) return pending;

		jwt = 'TODO';
		if(jwt){
			// req.headers{a:b} => Headers instance w/ these headers
			req.headers = new Headers(req.headers);
			req.headers.set("Authorization", 'Bearer '+jwt);
		}else{
			// don't need loginChange event here, that's already handled
			return Promise.reject({appmsg: '', response:null, body:null, url: url, request: req, error: new Error('please login, token required')});
		};

		function _finish(res={}){
			var appmsg;
			clearTimeout(req._timer);
			appmsg = res.headers ? res.headers.get('appmsg') : '';
			delete models[url];
			if(debug) console[res.ok ? 'log' : 'warn']((res.status||res.message||res), (res.statusText||''), appmsg, (res.url||url||'').replace(/^.*?\w\//,'/'))
			return {appmsg: appmsg, response: res, body: null};
		};

		// return promise w/ timer, prevent multiple identical requests, always return the same type of result object
		return models[url] = new Promise(function _fetching(resolve, reject){

			var timeout = req.timeout || 30000;
			req._timer = setTimeout(function _fetchTimeout(){
				return reject( _finish(new Error(`timeout ${timeout}ms`)) );
			}, timeout);

			fetch(url, req)
			.then(_finish, _finish)
			.then(function _fetchedResult(result){
				var msg, res = result.response;

				if(res.status === 401){
					msg = res.statusText || '';
					msg = msg ? (msg + ' ' + result.appmsg) : result.appmsg;

					self.dispatchEvent(new CustomEvent('loginChange', {detail: {error: 'login again ('+(msg || 'unauthorized token')+')'}}));
					return Promise.reject(result);
				};

				if(!res.body) return result;

				var contentType = res.headers.get('content-type') || '';
				return res.text()
				.then(function _fetchedOk(body){
					var res = result;
					try{
						res.text = body;
						if(/application\/json/.test(contentType)) res.body = JSON.parse(body);
						else res.body = body;
					}catch(err){
						res.error = err;
						res.body = null;
					};
					return (!res.error && res.response && res.response.ok) ? res: Promise.reject(res);
				})
			})
			.then(resolve, reject);
		});
	}
	,rep: function(res){
		console.log('rep(res)',res); 
		return res; 
	}
}).init(self);
