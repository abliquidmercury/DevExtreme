var gulp = require('gulp');
var path = require('path');
var typescript = require('gulp-typescript');
var replace = require('gulp-replace');
var sourcemaps = require('gulp-sourcemaps');
var del = require('del');
var karmaServer = require('karma').Server;
var karmaConfig = require('karma').config;
var buildConfig = require('./build.config');
var header = require('gulp-header');
var ngPackagr = require('ng-packagr');
var exec = require('child_process').exec;

var AngularMetadataGenerator = require('devextreme-internal-tools').AngularMetadataGenerator;
var AngularDotGenerator = require('devextreme-internal-tools').AngularDotGenerator;
var AngularFacadeGenerator = require('devextreme-internal-tools').AngularFacadeGenerator;
var AngularModuleFacadeGenerator = require('devextreme-internal-tools').AngularModuleFacadeGenerator;
var AngularCommonReexportsGenerator = require('devextreme-internal-tools').AngularCommonReexportsGenerator;
var AngularComponentNamesGenerator = require('devextreme-internal-tools').AngularComponentNamesGenerator;

const argv = require('yargs')
    .default('with-descriptions', false)
    .argv;

//------------Components------------

gulp.task('clean.metadata', gulp.series(function() {
    var outputFolderPath = buildConfig.tools.metadataGenerator.outputFolderPath;

    return del([outputFolderPath]);
}));

gulp.task('generate.metadata', gulp.series('clean.metadata', function(done) {
    var generator = new AngularMetadataGenerator();

    generator.generate(buildConfig.tools.metadataGenerator);
    done();
}));

gulp.task('clean.generatedComponents', function(done) {
    var { outputFolderPath } = buildConfig.tools.componentGenerator;
    del.sync([outputFolderPath + "/**"]);
    done();
});

gulp.task('generate.components', gulp.series('generate.metadata', 'clean.generatedComponents', function(done) {
    var generator = new AngularDotGenerator();

    generator.generate(buildConfig.tools.componentGenerator);
    done();
}));

gulp.task('generate.moduleFacades', gulp.series('generate.components', function(done) {
    var moduleFacadeGenerator = new AngularModuleFacadeGenerator();

    moduleFacadeGenerator.generate(buildConfig.tools.moduleFacadeGenerator);
    done();
}));

gulp.task('generate.facades', gulp.series('generate.moduleFacades', function(done) {
    var facadeGenerator = new AngularFacadeGenerator();

    facadeGenerator.generate(buildConfig.tools.facadeGenerator);
    done();
}));

gulp.task('generate.common-reexports', function(done) {
    var commonReexportsGenerator = new AngularCommonReexportsGenerator();

    commonReexportsGenerator.generate(buildConfig.tools.commonReexportsGenerator);
    done();
});

gulp.task('build.license-headers', function() {
    var config = buildConfig.components,
        pkg = require('./package.json'),
        now = new Date(),
        data = {
            pkg: pkg,
            date: now.toDateString(),
            year: now.getFullYear()
        };

    var banner = [
        '/*!',
        ' * <%= pkg.name %>',
        ' * Version: <%= pkg.version %>',
        ' * Build date: <%= date %>',
        ' *',
        ' * Copyright (c) 2012 - <%= year %> Developer Express Inc. ALL RIGHTS RESERVED',
        ' *',
        ' * This software may be modified and distributed under the terms',
        ' * of the MIT license. See the LICENSE file in the root of the project for details.',
        ' *',
        ' * https://github.com/DevExpress/devextreme-angular',
        ' */',
        '\n' // This new line is necessary to keep the header after TS compilation
        ].join('\n');

    return gulp.src(`${config.outputPath}/${config.srcFilesPattern}`)
        .pipe(header(banner, data))
        .pipe(gulp.dest(config.outputPath));
});

gulp.task('clean.dist', function() {
    del.sync([buildConfig.components.outputPath + "/*.*"]);
    return del([buildConfig.components.outputPath]);
});

gulp.task('build.ngc', function() {
    var config = buildConfig.components;

   return ngPackagr
        .ngPackagr()
        .forProject(path.join(config.outputPath, 'ng-package.json'))
        .withTsConfig('tsconfig.lib.json')
        .build()
});

gulp.task('build.copy-sources', gulp.series('clean.dist', function() {
    var config = buildConfig.components;
    return gulp.src(config.sourcesGlobs)
        .pipe(gulp.dest(config.outputPath));
}));

// Note: workaround for https://github.com/angular/angular-cli/issues/4874
gulp.task('build.remove-unusable-variable', function() {
    var config = buildConfig.npm;

    return gulp.src(config.distPath + '/**/*.js')
        .pipe(replace(/DevExpress\.[\w\.]+/g, 'Object'))
        .pipe(gulp.dest(config.distPath));
});

gulp.task('build.components', gulp.series(
        'build.copy-sources',
        'build.license-headers',
        'build.ngc',
        'build.remove-unusable-variable'
));

//------------npm------------

gulp.task('npm.content', gulp.series(
    'build.copy-sources',
    'build.license-headers',
    'build.ngc',
    'build.remove-unusable-variable',
    function() {
        var npmConfig = buildConfig.npm,
            cmpConfig = buildConfig.components;

        return gulp.src([cmpConfig.outputPath + '/**/collection.json', ...npmConfig.content])
            .pipe(gulp.dest(npmConfig.distPath));
    })
);

gulp.task('npm.pack', gulp.series(
    'npm.content',
    (cb) => {
        argv.withDescriptions ? exec('npm --prefix ../../ run angular:inject-descriptions', (err) => cb(err)) : cb();
    },
    (cb) => { exec('npm pack', { cwd: buildConfig.npm.distPath }, (err) => cb(err)) },
    () => { return  gulp.src(buildConfig.npm.distPath)
    .pipe(gulp.dest('./node_modules/devextreme-angular')); }
));

gulp.task('copy.source', function() {
    var npmConfig = buildConfig.npm;
    return gulp.src(`${path.join(npmConfig.distPath, '/**/*.*')}`)
        .pipe(gulp.dest('./node_modules/devextreme-angular'));
});

//------------Main------------

var buildTask = gulp.series(
    'build.components',
    'copy.source'
);

gulp.task('build', buildTask);
gulp.task('default', buildTask);
gulp.task('generate', gulp.series(
    'generate.facades',
    'generate.common-reexports'
));


//------------Testing------------

gulp.task('clean.tests', function() {
    var outputFolderPath = buildConfig.components.testsPath;

    return del([outputFolderPath]);
});

gulp.task('generate-component-names', function(done) {
    var generator = new AngularComponentNamesGenerator(buildConfig.tools.componentNamesGenerator);

    generator.generate();

    done();
});

gulp.task('build.tests', gulp.series('clean.tests', 'generate-component-names', function() {
    var config = buildConfig.components,
        testConfig = buildConfig.tests;

    return gulp.src(config.tsTestSrc)
        .pipe(sourcemaps.init())
        .pipe(typescript(testConfig.tsConfigPath))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(config.testsPath));
}));

gulp.task('watch.spec', function() {
    gulp.watch(buildConfig.components.tsTestSrc, ['build.tests']);
});

var getKarmaConfig = function(testsPath) {
    const preprocessors = {};
    preprocessors[testsPath] = [ 'webpack' ];
    return karmaConfig.parseConfig(path.resolve('./karma.conf.js'), {
        files: [{ pattern: testsPath, watched: false }],
        preprocessors: preprocessors
    });
};

gulp.task('test.components.client', gulp.series('build.tests', function(done) {
    new karmaServer(getKarmaConfig('./karma.test.shim.js'), done).start();
}));

gulp.task('test.components.server', gulp.series('build.tests', function(done) {
    new karmaServer(getKarmaConfig('./karma.server.test.shim.js'), done).start();
}));

gulp.task('test.components.client.debug', function(done) {
    var config = getKarmaConfig('./karma.test.shim.js');
    config.browsers = [ 'Chrome' ];
    config.singleRun = false;

    new karmaServer(config, done).start();
});

gulp.task('test.components.server.debug', function(done) {
    var config = getKarmaConfig('./karma.server.test.shim.js');
    config.browsers = [ 'Chrome' ];
    config.singleRun = false;

    new karmaServer(config, done).start();
});

gulp.task('run.tests', gulp.series('test.components.client'));

// gulp.task('run.tests', gulp.series('test.components.client', 'test.components.server'));

gulp.task('test', gulp.series('build', 'run.tests'));

gulp.task('watch.test', function(done) {
    new karmaServer({
        configFile: __dirname + '/karma.conf.js'
    }, done).start();
});