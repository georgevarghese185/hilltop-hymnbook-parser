import axios from "axios";
import * as cheerio from "cheerio";
import { readFileSync, writeFileSync } from "node:fs";

const getCelebrationSource1Song = async (songNumber) => {
  const baseUrl = "https://hymnary.org/hymn/CEL1997";

  const resp = await axios.get(`${baseUrl}/${songNumber}#text`);
  const $ = cheerio.load(resp.data);

  if ($("#text").length < 1) {
    return null;
  }

  const paragraphs = getParagraphs($, $("#text p"));
  const title = $(".hymntitle").text();

  return {
    songNumber,
    title,
    lyrics: paragraphs,
  };
};

const getCelebrationSource2 = async () => {
  const resp = await axios.get(
    "https://digitalsongsandhymns.com/c/songbook/celebration-hymnal"
  );

  const $ = cheerio.load(resp.data);
  const $td = $("td");

  let index = [];

  for (let i = 0; i < $td.length; i += 2) {
    index.push({
      number: $($td[i]).text(),
      numberParsed: parseInt($($td[i]).text()),
      title: $($td[i]).next().text(),
      link: $($td[i]).next().find("a").attr("href"),
    });
  }

  index = index
    .filter((s) => !isNaN(s.numberParsed))
    .sort((s1, s2) => s1.numberParsed - s2.numberParsed);

  return index;
};

const getCelebrationSource2Song = async (song) => {
  const resp = await axios.get(song.link);
  const $ = cheerio.load(resp.data);

  const ps = $("#tab-lyrics p");
  return getParagraphs($, ps);
};

const getParagraphs = ($, ps) => {
  const paragraphs = [];

  for (const p of ps) {
    paragraphs.push($(p).find("br").replaceWith("\n").end().text().trim());
  }

  return paragraphs;
};

const getCelebrationSongBook = async () => {
  const source2Songs = await getCelebrationSource2();

  let songs;

  try {
    songs = JSON.parse(readFileSync("celebration.json").toString());
  } catch (e) {
    songs = [];
  }

  const startFrom = songs[songs.length - 1]?.songNumber || 0;

  for (let songNumber = startFrom + 1; songNumber <= 818; songNumber++) {
    try {
      let song = await getCelebrationSource1Song(songNumber);

      if (!song) {
        console.warn(
          `Could not get song ${songNumber} from source 1. Trying source 2`
        );
        const source2Song = source2Songs.find(
          (s) => s.numberParsed === songNumber
        );
        if (!source2Song) {
          throw new Error("Could not get Song from either sources");
        }
        const paragraphs = await getCelebrationSource2Song(source2Song);
        song = {
          songNumber,
          lyrics: paragraphs,
          title: `${songNumber}. ${source2Song.title}`,
        };
      }

      songs.push(song);

      writeFileSync("celebration.json", JSON.stringify(songs, null, 2));

      console.log(`Got song ${songNumber}`);
    } catch (e) {
      console.error(`Failed to get Song ${songNumber}`);
      console.error(e);
    }
  }
};

const buildSongbookText = (songs) => {
  return songs
    .map((song) => {
      const lyrics = song.lyrics
        .reduce((lyrics, para, index, paras) => {
          if (/^Verse \d+$/.test(para)) {
            const verse = para.match(/Verse (\d+)/)[1];
            paras[index + 1] = `V${verse}. ${paras[index + 1]}`;
            return lyrics;
          }

          if ("Chorus" === para) {
            paras[index + 1] = `C. ${paras[index + 1]}`;
            return lyrics;
          }

          para = para
            .replace(/\n{2,}/g, "\n")
            .replace(/^(\d)+\.?/, "V$1.")
            .replace(/^Verse (\d)\s*\n/, "V$1. ")
            .replace(/^Verse\s*\n/, "")
            .replace(/^Chorus:?\s*\n+/, "C. ")
            .replace(/^Refrain:?\s*\n+/, "C. ")
            .trim();

          return [...lyrics, para];
        }, [])
        .join("\n\n");
      return `Song ${song.title}\n\n` + lyrics + "\n\n©";
    })
    .join("\n\n\n");
};

const buildCelebrationSongbookTextFile = () => {
  const songs = JSON.parse(readFileSync("celebration.json").toString());

  const songbookText = buildSongbookText(songs);

  writeFileSync("celebration.txt", songbookText);
};

const buildRemembranceSongbookTextFile = () => {
  const songs = JSON.parse(readFileSync("remembrance.json").toString());

  const songbookText = buildSongbookText(songs);

  writeFileSync("remembrance.txt", songbookText);
};

const getRemembranceSongs = async () => {
  const resp = await axios.get("https://saintsserving.net/hymnbook.php?id=5");
  const $ = cheerio.load(resp.data);

  const tds = $("td.right");
  const songs = [];

  for (let td of tds) {
    const songNumber = $(td).text();
    const title = $(td).next().find("a").text();
    const link =
      "https://saintsserving.net/" + $(td).next().find("a").attr("href");

    songs.push({ songNumber, title, link });
  }

  return songs;
};

const getRemembranceSong = async (song) => {
  const resp = await axios.get(song.link);
  const $ = cheerio.load(resp.data);

  const title = `${song.songNumber}. ${$("#info h1").text()}`;
  const para = $("#rightcol > p");
  const lyrics = getParagraphs($, para).flatMap((p) => p.split(/\n\n{3,}/));

  return {
    songNumber: parseInt(song.songNumber),
    title,
    lyrics,
  };
};

const getRemembranceSongBook = async () => {
  let songList = await getRemembranceSongs();

  let songs;

  try {
    songs = JSON.parse(readFileSync("remembrance.json").toString());
  } catch (e) {
    songs = [];
  }

  const lastSong = songs[songs.length - 1];
  if (lastSong) {
    songList = songList.slice(
      songList.findIndex(
        (s) => s.songNumber.toString() == lastSong.songNumber.toString()
      ) + 1
    );
  }

  for (const songToFetch of songList) {
    try {
      let song = await getRemembranceSong(songToFetch);

      songs.push(song);

      writeFileSync("remembrance.json", JSON.stringify(songs, null, 2));

      console.log(`Got song ${songToFetch.songNumber}`);
    } catch (e) {
      console.error(`Failed to get Song ${songToFetch.songNumber}`);
      console.error(e);
    }
  }
};

await getCelebrationSongBook();
await buildCelebrationSongbookTextFile();
await getRemembranceSongBook();
await buildRemembranceSongbookTextFile();
