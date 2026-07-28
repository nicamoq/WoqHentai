const fs = require('fs');
const path = require('path');

const projectsDir = path.join(__dirname, 'projects');
const outputJson = path.join(projectsDir, 'list.json');

function generateProjectsList() {
    try {
        const items = fs.readdirSync(projectsDir);
        const projects = [];

        for (const item of items) {
            const itemPath = path.join(projectsDir, item);
            const stat = fs.statSync(itemPath);

            if (stat.isDirectory()) {
                const metaPath = path.join(itemPath, 'meta.json');
                let metaData = {
                    id: item,
                    title: item,
                    description: `A project named ${item}`,
                    url: `projects/${item}/`,
                    thumbnail: ''
                };

                // If project has a meta.json, load it for rich data
                if (fs.existsSync(metaPath)) {
                    try {
                        const fileContent = fs.readFileSync(metaPath, 'utf8');
                        const parsed = JSON.parse(fileContent);
                        metaData = { ...metaData, ...parsed };
                    } catch (e) {
                        console.error(`Error parsing meta.json for project ${item}:`, e);
                    }
                }

                projects.push(metaData);
            }
        }

        fs.writeFileSync(outputJson, JSON.stringify(projects, null, 2), 'utf8');
        console.log(`Successfully generated list.json with ${projects.length} projects.`);
    } catch (err) {
        console.error('Error generating projects list:', err);
    }
}

generateProjectsList();
