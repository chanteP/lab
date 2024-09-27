import { SitemapStream, streamToPromise } from 'sitemap';
import { Readable } from 'stream';
import glob from 'glob';
import { readFileSync, writeFileSync } from 'fs';

const metaList = glob.sync('./src/*/meta.json');

const links = metaList.map((metaFile) => {
    const metaData = JSON.parse(readFileSync(metaFile, 'utf8'));
    return {
        url: metaData.canonical,
        changefreq: 'daily',
        priority: 1,
        lastmod: new Date().toLocaleDateString(),
    };
});

console.log(links);

// Create a stream to write to
const stream = new SitemapStream({ hostname: 'https://lab.neetproject.com/' });

// // Return a promise that resolves with your XML string
streamToPromise(Readable.from(links).pipe(stream)).then((data) => {
    writeFileSync('./docs/sitemap.xml', data.toString());
});
