# NovaDL Planning Context

## Goal

Build a desktop application that wraps `yt-dlp` with a friendly UI for people who do not want to use the command line.

## Stack

- Electron desktop shell
- Vite + React + TypeScript renderer
- Electron main process for filesystem access and `yt-dlp` subprocess management

## MVP

- Paste a video URL
- Pick a download folder
- Choose video/audio mode and quality
- Start, monitor, cancel, and remove downloads
- Persist basic user preferences locally
- Bundle `yt-dlp` and `ffmpeg` with app

## Later

- Binary auto-update flow
- Cookies
- Subtitles
- Playlist ranges
- Advanced format selector
- Download history
