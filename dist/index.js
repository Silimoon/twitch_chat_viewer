"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const node_schedule_1 = __importDefault(require("node-schedule"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const titles = ["BROADCASTER", "VIP", "MOD", "Staff", "Admin", "Global mod", "Viewer"];
//clearing the logs and data once when starting
clearSaves("data");
clearSaves("logs");
//the interval size for checking
const second = 15;
//add the channels to watch
const channels = ["fuyumitoba"];
//runs every ${second} seconds
const job = node_schedule_1.default.scheduleJob(`*/${second} * * * * *`, async function () {
    channels.forEach(async (channel) => {
        //fetching who left, joined or stayed
        const viewer = await getViewers(channel);
        const date = new Date();
        const filename = createTimeString(date) + "-" + currentCollection.chatter_count + "-chatters" + ".txt";
        let stayed = [];
        let changes = false;
        //logging it
        viewer.forEach((e, i) => {
            if (e.joined.length) {
                changes = true;
                console.log(titles[i] + " joined", e.joined, date);
                addToLogs(filename, titles[i] + " joined " + "\n " + e.joined.map((e) => { return `${e.name} joined at ${e.joinedAt}`; }).join("\n ") + "\n", channel);
            }
            if (e.left.length) {
                changes = true;
                console.log(titles[i] + " left", e.left, date);
                e.left.sort((a, b) => a.stayedSince - b.stayedSince);
                addToLogs(filename, titles[i] + " left " + "\n " + e.left.map((ele) => {
                    return `${ele.name} joined at ${ele.joinedAt} and stayed since ${computeTime(ele.stayedSince)}`;
                }).join("\n ") + "\n", channel);
            }
            if (e.stayed.length) {
                e.stayed.sort((a, b) => a.stayedSince - b.stayedSince);
                stayed = stayed.concat(e.stayed.map((ele) => {
                    return `${ele.name} stayed since ${computeTime(ele.stayedSince)}`;
                }));
            }
        });
        if (changes && stayed.length) {
            addToLogs(filename, "Stayed:\n " + stayed.join("\n "), channel);
        }
    });
});
/**
 * returns a nicer string
 * @param time
 * @returns
 */
function computeTime(time) {
    let timeSince = "";
    let days = Math.floor(time / 60 / 60 / 24) % 30, hours = Math.floor(time / 60 / 60) % 60, minutes = Math.floor(time / 60) % 60, seconds = time % 60;
    if (days > 0)
        timeSince = timeSince.concat(days + " days, ");
    if (hours > 0)
        timeSince = timeSince.concat(hours + " hours, ");
    if (minutes > 0)
        timeSince = timeSince.concat(minutes + " minutes, ");
    timeSince = timeSince.concat(seconds + " seconds");
    return timeSince;
}
/**
 * returns a nicer date string
 * @param date
 * @returns
 */
function createTimeString(date) {
    return date.getDate() + "#" + (date.getMonth() + 1) % 12 + "#" + date.getHours() + "#" + date.getMinutes() + "#" + date.getSeconds();
}
/**
 * writes to logs
 * @param filename
 * @param content
 * @param streamer
 */
function addToLogs(filename, content, streamer) {
    fs_1.default.mkdir(`logs/${streamer}`, {}, () => {
        fs_1.default.appendFileSync(`logs/${streamer}/${filename}`, content);
    });
}
/**
 *
 * @param filename writes to data
 * @param content
 * @param streamer
 */
function saveData(filename, content, streamer) {
    fs_1.default.mkdir(`data/${streamer}`, {}, () => {
        fs_1.default.appendFileSync(`data/${streamer}/${filename}`, content);
    });
}
let streamerCollection = {
    collection: []
};
let currentCollection = {
    _links: {
        links: {}
    },
    chatter_count: 0,
    chatters: [[], [], [], [], [], [], []]
};
/**
 * fetches the data of the streamer
 * @param streamer
 * @returns
 */
function getFromSCollection(streamer) {
    let streamerData = streamerCollection.collection.find((c) => c.streamer == streamer);
    if (!streamerData) {
        addToAndUpdateCollection(streamer, { _links: {}, chatter_count: 0, chatters: [[], [], [], [], [], [], []] });
        return getFromSCollection(streamer);
    }
    else {
        return streamerData.data;
    }
}
/**
 * saves the data of the streamer
 * @param streamer
 * @param streamerData
 */
function addToAndUpdateCollection(streamer, streamerData) {
    let sCollection = streamerCollection.collection.find((c) => c.streamer == streamer);
    if (sCollection)
        sCollection.data = streamerData;
    else
        streamerCollection.collection.push({ streamer: streamer, data: streamerData });
}
/**
 * fetches the data from the website
 * @param streamer
 * @returns
 */
async function getViewers(streamer) {
    const link = `http://tmi.twitch.tv/group/user/${streamer}/chatters`;
    return await axios_1.default.get(link).then(function (response) {
        const data = response.data;
        const chatters = data.chatters;
        const stringChatters = [chatters.broadcaster, chatters.vips, chatters.moderators, chatters.staff, chatters.admins, chatters.global_mods, chatters.viewers];
        const userChatters = convertToChatterList(stringChatters);
        currentCollection._links = data._links;
        currentCollection.chatter_count = data.chatter_count;
        currentCollection.chatters = userChatters;
        const changedData = compareChatterObj(userChatters, streamer);
        return changedData;
    });
}
/**
 * this one just converts an array to another type
 * @param stringList
 * @returns
 */
function convertToChatterList(stringList) {
    let chatterList = [[], [], [], [], [], [], []];
    stringList.forEach((sL, i) => {
        sL.forEach((s) => {
            chatterList[i].push({
                name: s,
                joinedAt: createTimeString(new Date()),
                stayedSince: 0
            });
        });
    });
    return chatterList;
}
/**
 * the main method for checking whether someone joined/left/stayed
 * @param inputData
 * @param streamer
 * @returns
 */
function compareChatterObj(inputData, streamer) {
    let stayed = [[], [], [], [], [], [], []];
    let joined = [[], [], [], [], [], [], []];
    let left = [[], [], [], [], [], [], []];
    let previousChatters = getFromSCollection(streamer).chatters;
    //haha, those were fun... logic, logic logic!
    inputData.forEach((dL, i) => {
        dL.forEach((c) => {
            let savedChatter = previousChatters[i].find((chatter) => {
                return chatter.name == c.name;
            });
            if (savedChatter)
                stayed[i].push({ name: savedChatter.name, joinedAt: savedChatter.joinedAt, stayedSince: savedChatter.stayedSince + second });
            else
                joined[i].push(c);
        });
    });
    previousChatters.forEach((sL, i) => {
        sL.forEach(async (s, j) => {
            if (!inputData[i].map(input => { return input.name; }).includes(s.name))
                left[i].push(previousChatters[i][j]);
        });
    });
    let final = [];
    stayed.forEach((_, i) => {
        final.push({ joined: joined[i], left: left[i], stayed: stayed[i] });
    });
    let newChatters = joined.map((v, i) => {
        return v.concat(stayed[i]).sort((a, b) => { return a.stayedSince - b.stayedSince; });
    });
    let saveObject = {
        _links: currentCollection._links,
        chatter_count: currentCollection.chatter_count,
        chatters: newChatters
    };
    addToAndUpdateCollection(streamer, saveObject);
    let changes = joined.map((jL) => jL.length).concat(left.map((sL) => sL.length)).filter((v) => v != 0);
    if (changes.length) {
        const filename = createTimeString(new Date()) + "-" + streamer + "-data" + ".txt";
        saveData(filename, JSON.stringify(saveObject), streamer);
    }
    return final;
}
/**
 * clears the logs/data
 * @param type
 * @returns
 */
function clearSaves(type) {
    let errmsg = "", err = null;
    fs_1.default.readdir(type, function (err, dirs) {
        if (err) {
            console.error("Could not list the directory.", err);
            return;
        }
        dirs.forEach((dir) => {
            let searchPath = path_1.default.join(type, dir);
            fs_1.default.rmdirSync(searchPath, { recursive: true });
        });
    });
    return err != null ? { done: false, msg: errmsg } : { done: true };
}
