/*
 * routing: location events, history.state (restorable view/location info);
 * models: some sort of tool for shared and non-shared models;
 * http-requests specific to APIs with related to authentication+authorization
 * TODO see if this leaks and how; tests; expand/fix
 */
export const state = ({
	[Symbol.for('models')]: new WeakMap()
	,urlSearchMap: function(params = {}, item=''){
		var part = item.split('='), name = part[0].trim();
		if(!name) return params;
		params[ part[0] ] = decodeURIComponent( part[1] || '' );
		return params;
	}
	/*
		input a url with hash like '#//stuff/things/?this=that&other'
		return original url decorated with
			hashpath: ['stuff','things']
			hashparam: {this:'that', other:''}

		https://developer.mozilla.org/docs/Web/API/URL
		https://nodejs.org/api/url.html
	 */
	,urlHashTranslate: function(url=location){
		var stuff, parts = url.hash.match(/^(#[^?]*)?(?:\??(.*))?$/) || [];
		url.hashpath = (parts[1] || '').trim().replace(/\/{2,}/g,'/').replace(/\/$/,'').split('/').splice(1);
		url.hashparam = (parts[2] || '').trim().replace(/\&{2,}/g,'&').replace(/\&$/,'').split('&').reduce(this.urlSearchMap, {});
		return url;
	}
	,routing: function(self=window){
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
				state.locationChange();
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
		// pass location to all handlers on event.detail; provide a convenient way to access the state at event.location.state
		Object.defineProperties(self.location, {
			history: {
				get: function(){ return history }
			}
			,state: {
				get: function(){ return history.state }
			}
		});
		self.addEventListener('popstate', this.locationChange.bind(this));
	}
	,locationChange: function(e){
		const detail = this.urlHashTranslate(location);
		self.dispatchEvent(new CustomEvent('locationchange', {detail: detail}));
	}
	,init: function(){
		const models = this[Symbol.for('models')];
		let data;
		if(!self.state){
			self.state = this;

			data = new WeakMap();
			self.addEventListener('modelupdate', this.modelUpdate.bind(this));
			// provide a global model for sharing
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
			this.locationChange();
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

					window.dispatchEvent(new CustomEvent('loginChange', {detail: {error: 'login again ('+(msg || 'unauthorized token')+')'}}));
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
