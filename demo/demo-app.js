import { state } from './state.js';

class DemoApp extends HTMLElement{
	constructor(){
		super();

		this.data = {
			name: 'example'
			, index: this.constructor.index
			, global: state.global
		};

		this.attachShadow({mode:'open'}).innerHTML = this.render();
		this.shadowRoot.querySelector('button').addEventListener('click', this.clicked.bind(this));
	}
	static get index(){
		var n = this.count || (this.count = 0);
		this.count++;
		return n;
	}
	connectedCallback(){
		let handler = this.updated;
		if(!handler) handler = this.updated = this.update.bind(this);
		window.addEventListener('model', handler);
		window.addEventListener('model-demoapp', handler);
		window.addEventListener('locationchange', handler);
	}
	disconnectedCallback(){
		let handler = this.updated;
		window.removeEventListener('locationchange', handler);
		window.removeEventListener('model', handler);
	}
	get model(){
		return this.data;
	}
	set model(data){
		Object.assign(this.data, data);
		
		return true;
	}
	update(e){
		const detail = e.detail;
		switch(e.type){
		case 'locationchange':
			console.log(e.type, detail.state, detail);
		break;
		case 'model':
			this.redraw();
		break;
		default:
			console.warn(`TODO ${e.type}`, detail);
		};
	}

	clicked(e){
		this.data.global.demo = Date.now();
	}
	redraw(){
		requestAnimationFrame(this.renderHTML.bind(this));
	}
	renderHTML(){
		const data = this.data;
		this.innerHTML = `shared ${this.data.global.demo}`;
	}
	render(){
return `
<style>
@import url('./style-shared.css');
:host {background-color:var(--demo-light, #eee); font-size:1rem;position:relative;display:flex;flex-flow:column nowrap;box-sizing:border-box; max-height:100%; }
section{}
:host(.show-info) section.info{display:block;}
header{font-size:small;position:relative;background-color:var(--demo-dark);}
nav{flex: 1 1 auto; display: flex; flex-wrap: wrap;align-items:baseline;padding-right:0.5em;}
nav > *{color:#fff;text-decoration:none;margin:0;user-select:none;line-height:1.3em;padding:0.5em 1em;user-select:none;}

nav > .menu{padding:0;}
nav .app-selector{cursor:pointer !important;}
nav .app-selector:hover{background-color:rgba(255,255,255,0.1);}
.app-selector *{cursor:pointer;}
nav a:hover, nav a:active, nav a:focus{;}

main{padding:1rem;flex:1 1 auto;width:100%;height:auto;margin:0 auto 0 auto;box-sizing:border-box;overflow:auto;z-index:1;}
</style>

<header>
	<nav>
		<a href="#/ping?stuff=things">ping</a>
		<a href="#/space?time=${Date.now()}">time</a>
	</nav>
</header>
<section>&sect; ${ this.data.index + 1 } ${ this.data.name } <button>button time</button></section>
<main>
	<slot>${ this.data.global.demo || '~' }</slot>
</main>
`;
	}
}
window.customElements.define('demo-app', DemoApp);
