const BLOCK_SIZE = 128;
const NAME_CHAR_LIMIT = 16;
const MAX_TO_OPEN = 4;

const directory = [];

const fileDescriptors = new Map();

const blocks = new Map();

const openedFiles = new Map();

class FileDescriptor {
    constructor(type) {
        this.type = type;
        this.hardlinks = 0;
        this.openCount = 0;
        this.size = 0;
        this.blocks = new Map();
    }
}

const stat = (name) => {
    const record = directory.find(rec => rec.name === name && rec.valid);
    if (!record) {
        throw new Error("File not found");
    }

    const fd = fileDescriptors.get(record.fd);
    return {
        type: fd.type,
        hardlinks: fd.hardlinks,
        size: fd.size,
    };
}

const ls = () => {
    directory.forEach(rec => {
        if (rec.valid) {
            console.log(`${rec.name} -> FD: ${rec.fd}`);
        }
    });
}

const create = (name) => {
    if (name.length > NAME_CHAR_LIMIT) {
        throw new Error("Filename too long");
    }
    if (directory.find(rec => rec.name === name && rec.valid)) {
        throw new Error("File already exists");
    }

    const fdIndex = fileDescriptors.size;
    const fd = new FileDescriptor("regular");
    fd.hardlinks = 1;
    fileDescriptors.set(fdIndex, fd);

    directory.push({ name, fd: fdIndex, valid: true });
}

const open = (name) => {
    const record = directory.find(rec => rec.name === name && rec.valid);
    if (!record) {
        throw new Error("File not found");
    }

    let index = 0;
    while (openedFiles.has(index)) {
        index++;
    }

    if (index >= MAX_TO_OPEN) {
        throw new Error("Max files opened");
    }

    const fd = fileDescriptors.get(record.fd);
    fd.openCount++;

    openedFiles.set(index, { fd: record.fd, offset: 0 });

    return index;
}

const close = (ofIndex) => {
    const openedFile = openedFiles.get(ofIndex);
    if (!openedFile) {
        throw new Error("File descriptor not found");
    }

    const fd = fileDescriptors.get(openedFile.fd);
    fd.openCount--;

    openedFiles.delete(ofIndex);
}

const seek = (ofIndex, offset) => {
    const openedFile = openedFiles.get(ofIndex);
    if (!openedFile) {
        throw new Error("File descriptor not found");
    }

    if (offset < 0) {
        throw new Error("Invalid offset");
    }

    openedFile.offset = offset;
}

const read = (ofIndex, size) => {
    const openedFile = openedFiles.get(ofIndex);
    if (!openedFile) {
        throw new Error("File descriptor not found");
    }

    const fd = fileDescriptors.get(openedFile.fd);
    let bytesRead = 0;
    const buffer = new Uint8Array(size);

    while (bytesRead < size && openedFile.offset < fd.size) {
        const blockIndex = Math.floor(openedFile.offset / BLOCK_SIZE);
        const blockOffset = openedFile.offset % BLOCK_SIZE;

        const blockNumber = fd.blocks.get(blockIndex);
        if (blockNumber === undefined) {
            const bytesLimit = Math.min(
                size - bytesRead,
                BLOCK_SIZE - blockOffset,
                fd.size - openedFile.offset
            );

            for (let i = 0; i < bytesLimit; i++) {
                buffer[bytesRead] = 0x00;
                bytesRead++;
                openedFile.offset++;
            }

            continue;
        }

        const blockData = blocks.get(blockNumber);
        const bytesLimit = Math.min(size - bytesRead, BLOCK_SIZE - blockOffset, fd.size - openedFile.offset);

        buffer.set(blockData.subarray(blockOffset, blockOffset + bytesLimit), bytesRead);

        bytesRead += bytesLimit;
        openedFile.offset += bytesLimit;
    }

    return buffer.subarray(0, bytesRead);
}

const write = (ofIndex, size) => {
    const openedFile = openedFiles.get(ofIndex);
    if (!openedFile) {
        throw new Error("File descriptor not found");
    }

    const fd = fileDescriptors.get(openedFile.fd);
    let bytesWritten = 0;

    while (bytesWritten < size) {
        const blockIndex = Math.floor(openedFile.offset / BLOCK_SIZE);
        const blockOffset = openedFile.offset % BLOCK_SIZE;

        if (!fd.blocks.has(blockIndex)) {
            const newBlockNumber = blocks.size;
            blocks.set(newBlockNumber, new Uint8Array(BLOCK_SIZE));
            fd.blocks.set(blockIndex, newBlockNumber);
        }

        const blockNumber = fd.blocks.get(blockIndex);
        const blockData = blocks.get(blockNumber);

        const bytesLimit = Math.min(size - bytesWritten, BLOCK_SIZE - blockOffset);

        for (let i = 0; i < bytesLimit; i++) {
            blockData[blockOffset + i] = Math.floor(Math.random() * 256);
        }

        bytesWritten += bytesLimit;
        openedFile.offset += bytesLimit;
    }

    fd.size = Math.max(fd.size, openedFile.offset);
};

const link = (name1, name2) => {
    const record1 = directory.find(rec => rec.name === name1 && rec.valid);
    if (!record1) {
        throw new Error("File not found");
    }
    if (directory.find(rec => rec.name === name2 && rec.valid)) {
        throw new Error("File already exists");
    }

    const fd = fileDescriptors.get(record1.fd);
    fd.hardlinks++;

    directory.push({ name: name2, fd: record1.fd, valid: true });
}

const unlink = (name) => {
    const record = directory.find(rec => rec.name === name && rec.valid);
    if (!record) {
        throw new Error("File not found");
    }

    const fd = fileDescriptors.get(record.fd);
    fd.hardlinks--;

    if (fd.hardlinks === 0 && fd.openCount === 0) {
        fileDescriptors.delete(record.fd);
    }

    record.valid = false;
}

const truncate = (name, size) => {
    const record = directory.find(rec => rec.name === name && rec.valid);
    if (!record) {
        throw new Error("File not found");
    }

    if (size < 0) {
        throw new Error("Invalid size");
    }

    const fd = fileDescriptors.get(record.fd);
    if (size < fd.size) {
        const lastBlockIndex = Math.floor((size - 1) / BLOCK_SIZE);
        for (let [blockIndex, _] of fd.blocks) {
            if (blockIndex >= lastBlockIndex) {
                fd.blocks.delete(blockIndex);
            }
        }
    }
    fd.size = size;
}



console.log("TEST START\n", "-----------------");


console.log("Creating a.txt");
create("a.txt");
console.log("a.txt created");
console.log(stat("a.txt"));


console.log("Opening a.txt");
const fd = open("a.txt");
console.log("fd = ", fd);


console.log("Writing 10 bytes to a.txt");
write(fd, 10);
console.log(stat("a.txt"));


console.log("Seeking to start and reading 10 bytes from a.txt");
seek(fd, 0);
const r1 = read(fd, 10);
console.log("Read result:", r1.length);


console.log("Writing 5 more bytes to a.txt");
write(fd, 5);
console.log(stat("a.txt"));


console.log("Seeking to 30 and reading 10 bytes from a.txt");
seek(fd, 30);
const r2 = read(fd, 10);
console.log("Read result:", r2);


console.log("Writing 5 bytes at offset 40");
write(fd, 5);
console.log(stat("a.txt"));


console.log("Seeking to 15 and reading 20 bytes from a.txt");
seek(fd, 15);
const r3 = read(fd, 20);
console.log("Read result:", r3.length);


console.log("Truncating a.txt to 8 bytes");
truncate("a.txt", 8);
console.log(stat("a.txt"));
seek(fd, 0);
console.log("Reading result after truncate:", read(fd, 20).length);


console.log("Truncating a.txt to 20 bytes");
truncate("a.txt", 20);
console.log(stat("a.txt"));
seek(fd, 8);
console.log("Reading result after truncate:", read(fd, 12));


console.log("Creating hard link b.txt from a.txt");
link("a.txt", "b.txt");
console.log(stat("a.txt"));
console.log(stat("b.txt"));


console.log("Unlinking a.txt");
unlink("a.txt");
console.log("ls after unlink a.txt:");
ls();
console.log(stat("b.txt"));


console.log("Unlinking b.txt");
unlink("b.txt");
console.log("unlinked b.txt (fd still open)");


console.log("Closing fd");
close(fd);
console.log("Closed fd");

console.log("-----------------\n", "TEST END");