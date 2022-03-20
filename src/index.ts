import axios, { AxiosError, AxiosResponse } from "axios";
import schedule from 'node-schedule';
import fs from 'fs';
import path from 'path'

const titles = ["BROADCASTER", "VIP", "MOD", "Staff", "Admin", "Global mod", "Viewer"]

//clearing the logs and data once when starting
clearSaves("data");
clearSaves("logs");

//the interval size for checking
const second = 15;

//==============> ADD THE CHANNELS TO WATCH HERE || Example: ["channel1", "channel2", "channel3"] <================ 
const channels: string[] = [""];

//runs every ${second} seconds
const job = schedule.scheduleJob(`*/${second} * * * * *`, async function(){
    channels.forEach(async (channel) => {
        //fetching who left, joined or stayed
        const viewer = await getViewers(channel);

        const date = new Date();
        const filename: string = createTimeString(date) + "-" + currentCollection.chatter_count + "-chatters" + ".txt";

        let stayed: string[][] = [];
        let changes:boolean = false;

        //logging it
        viewer.forEach((e, i) => {
            if(e.joined.length) {
                changes = true;
                console.log(titles[i] + " joined", e.joined, date );
                addToLogs(filename, titles[i] + " joined " +"\n " + e.joined.map((e) => {return `${e.name} joined at ${e.joinedAt}`}).join("\n ") + "\n", channel);
            }
            if(e.left.length) {
                changes = true;
                console.log(titles[i] + " left", e.left, date );
                e.left.sort((a,b) => a.stayedSince-b.stayedSince)
                addToLogs(filename, titles[i] + " left " + "\n " + e.left.map((ele) => {
                    return `${ele.name} joined at ${ele.joinedAt} and stayed since ${computeTime(ele.stayedSince)}`
                }).join("\n ") + "\n", channel);
            }
            if(e.stayed.length){
                e.stayed.sort((a,b) => a.stayedSince - b.stayedSince);
                stayed = stayed.concat(e.stayed.map((ele) => {
                    return `${ele.name} stayed since ${computeTime(ele.stayedSince)}`
                }));
            }
        })
        if(changes && stayed.length) {
            addToLogs(filename, "Stayed:\n " + stayed.join("\n "), channel)
        }
    })
});

/**
 * returns a nicer string
 * @param time 
 * @returns 
 */
function computeTime(time: number): string{
    let timeSince:string = "";
    let days = Math.floor(time/60/60/24)%30, hours = Math.floor(time/60/60)%60, minutes = Math.floor(time/60)%60, seconds = time%60;
    if(days>0) timeSince = timeSince.concat(days + " days, ");
    if(hours>0) timeSince = timeSince.concat(hours + " hours, ");
    if(minutes>0) timeSince = timeSince.concat(minutes + " minutes, ")
    timeSince = timeSince.concat(seconds + " seconds");
    return timeSince;
}

/**
 * returns a nicer date string
 * @param date 
 * @returns 
 */
function createTimeString(date: Date): string {
    return date.getDate() + "#" + (date.getMonth()+1)%12 + "#" + date.getHours() + "#" + date.getMinutes() + "#" +  date.getSeconds();
}

/**
 * writes to logs
 * @param filename 
 * @param content 
 * @param streamer 
 */
function addToLogs(filename: string, content: string, streamer: string){
    fs.mkdir(`logs/${streamer}`, {}, () => {
        fs.appendFileSync(`logs/${streamer}/${filename}`, content);
    });
}

/**
 * 
 * @param filename writes to data
 * @param content 
 * @param streamer 
 */
function saveData(filename: string, content:string, streamer: string){
    fs.mkdir(`data/${streamer}`, {}, () => {
        fs.appendFileSync(`data/${streamer}/${filename}`, content);
    })
}

interface axiosData {
    _links: {links: {}},
    chatter_count: number,
    chatters: {broadcaster: string[], vips: string[], moderators: string[], staff: string[], admins: string[], global_mods: string[], viewers: string[]}
}

interface streamerCollection {
    collection: {
        streamer: string,
        data: streamerData
    }[]
}

interface streamerData {
    _links: {},
    chatter_count: number,
    chatters: chatter[][]
}

interface chatterChanges {
    joined: chatter[],
    left: chatter[],
    stayed: chatter[]
}

interface chatter {
    name: string,
    joinedAt: string,
    stayedSince: number
}

let streamerCollection: streamerCollection = {
    collection: []
}

let currentCollection: streamerData = {
    _links: {
        links: {

        }
    },
    chatter_count: 0,
    chatters: [[],[],[],[],[],[],[]]
}

/**
 * fetches the data of the streamer
 * @param streamer
 * @returns 
 */
function getFromSCollection(streamer: string): streamerData {
    let streamerData = streamerCollection.collection.find((c) => c.streamer == streamer)
    if(!streamerData) {
        addToAndUpdateCollection(streamer, {_links: {}, chatter_count: 0, chatters: [[],[],[],[],[],[],[]]})
        return getFromSCollection(streamer);
    }else {
        return streamerData.data;
    }
}

/**
 * saves the data of the streamer
 * @param streamer 
 * @param streamerData 
 */
function addToAndUpdateCollection(streamer: string, streamerData: streamerData){
    let sCollection = streamerCollection.collection.find((c) => c.streamer == streamer);
    if(sCollection) sCollection.data = streamerData;
    else streamerCollection.collection.push({streamer: streamer, data: streamerData});
}

/**
 * fetches the data from the website
 * @param streamer 
 * @returns 
 */
async function getViewers(streamer: string): Promise<chatterChanges[]> {
    const link = `http://tmi.twitch.tv/group/user/${streamer}/chatters`
    return await axios.get(link).then(function (response) {
        const data: axiosData = response.data;
        const chatters = data.chatters;
        const stringChatters: string[][] = [chatters.broadcaster, chatters.vips, chatters.moderators, chatters.staff, chatters.admins, chatters.global_mods, chatters.viewers];
        const userChatters = convertToChatterList(stringChatters)
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
function convertToChatterList(stringList: string[][]): chatter[][] {
    let chatterList: chatter[][] = [[],[],[],[],[],[],[]];
    stringList.forEach((sL, i) => {
        sL.forEach((s) => {
            chatterList[i].push({
                name: s,
                joinedAt: createTimeString(new Date()),
                stayedSince: 0
            });
        })
    })
    return chatterList;
}

/**
 * the main method for checking whether someone joined/left/stayed
 * @param inputData 
 * @param streamer 
 * @returns 
 */
function compareChatterObj(inputData: chatter[][], streamer: string): chatterChanges[]{
    let stayed: chatter[][] = [[],[],[],[],[],[],[]];
    let joined: chatter[][] = [[],[],[],[],[],[],[]];
    let left: chatter[][] = [[],[],[],[],[],[],[]];

    let previousChatters:chatter[][] = getFromSCollection(streamer).chatters;

    //haha, those were fun... logic, logic logic!

    inputData.forEach((dL, i) => {
        dL.forEach((c) => {
            let savedChatter = previousChatters[i].find((chatter) => {
                return chatter.name == c.name;
            })
            if(savedChatter) stayed[i].push({name: savedChatter.name, joinedAt: savedChatter.joinedAt, stayedSince: savedChatter.stayedSince+second});
            else joined[i].push(c);
        })
    })

    previousChatters.forEach((sL, i) => {
        sL.forEach(async (s, j) => {
            if(!inputData[i].map(input => { return input.name; }).includes(s.name)) left[i].push(previousChatters[i][j]);
        })
    })

    let final: chatterChanges[] = [];
    stayed.forEach((_, i) => {
        final.push({joined: joined[i],left: left[i],stayed: stayed[i]})
    })

    let newChatters = joined.map((v, i) => {
        return v.concat(stayed[i]).sort((a,b) => {return a.stayedSince - b.stayedSince});
    })
    
    let saveObject: streamerData = {
        _links: currentCollection._links,
        chatter_count: currentCollection.chatter_count,
        chatters: newChatters
    }

    addToAndUpdateCollection(streamer, saveObject);

    let changes:number[] = joined.map((jL) => jL.length).concat(left.map((sL) => sL.length)).filter((v)=> v!=0);

    if(changes.length) {
        const filename: string = createTimeString(new Date()) + "-" + streamer + "-data" + ".txt";
        saveData(filename, JSON.stringify(saveObject) , streamer);
    }
    
    return final;
}

/**
 * clears the logs/data
 * @param type 
 * @returns 
 */
function clearSaves(type: "logs" | "data"): {done: boolean, msg?: string} {
    let errmsg = "", err = null;
    fs.readdir(type, function (err, dirs) {
        if (err) {
            console.error("Could not list the directory.", err);
            return;
        }
        dirs.forEach((dir) => {
            let searchPath = path.join(type, dir);
            fs.rmdirSync(searchPath, { recursive: true})
        });
    });
    return err!=null ? {done: false, msg: errmsg} : {done: true};
}
