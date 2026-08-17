var vsWorldGrid = new ol.tilegrid.TileGrid({
    extent: [-1024000,-1024000,1024000,1024000],
    origin: [-512000,512000],
    resolutions: [512,256,128,64,32,16,8,4,2,1],
    tileSize: [256, 256]
});