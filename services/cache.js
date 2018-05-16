const mongoose = require('mongoose');
const redis = require('redis');
const util = require('util');

const redisUrl = 'redis://127.0.0.1:6379';
const client = redis.createClient(redisUrl);
client.get = util.promisify(client.get);

// save the mongoose exec function as a copy to return later
const exec = mongoose.Query.prototype.exec;

// Overwrite mongoose query exec function for middleware
mongoose.Query.prototype.exec = async function() {
    // Key is created for redis with the query and the collection name
    const key = JSON.stringify(Object.assign({}, this.getQuery(), {
        collection: this.mongooseCollection.name
    }));

    // See if we have a value for key is Redis
    const cacheValue = await client.get(key);

    // if we do, return that
    if (cacheValue) {
        const doc = JSON.parse(cacheValue);

        return Array.isArray(doc)
            // is array return doc for each array item
            ? doc.map(d => new this.model(d))
            // else return single doc
            : new this.model(doc);
    }

    // otherwise, issue the query and store the result in redis

    // Return original mongoose exec function
    const result = await exec.apply(this, arguments);

    // Set query response into redis
    client.set(key, JSON.stringify(result));

    return result;
};