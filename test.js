var JVM = require("./libs/jvm");
var jvm = new JVM();
jvm.setLogLevel(7);
var entryPointClassName = jvm.loadJarFile("./test-data/jcodec-0.2.4-SNAPSHOT.jar");
jvm.setEntryPointClassName(entryPointClassName);
jvm.on("exit", function(code) {
    process.exit(code);
});
jvm.run([15]);