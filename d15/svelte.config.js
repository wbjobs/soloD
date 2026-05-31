import adapter from '@sveltejs/adapter-auto';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter(),
		files: {
			serviceWorker: 'src/service-worker.ts'
		}
	}
};

export default config;
