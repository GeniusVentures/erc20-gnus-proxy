import { expect, assert } from "chai";
import { ethers } from "hardhat";
import { ERC20ProxyFacet } from "../../typechain-types";
import { ERC20ProxyStorage } from "../../typechain-types";

describe("ERC20ProxyStorage", function () {
  let ERC20ProxyStorage;
  let erc20ProxyStorage;
  let erc1155Contract;
  let childTokenId = 1;
  let name = "Test Token";
  let symbol = "TTK";

  beforeEach(async function () {
    const ERC1155SupplyUpgradeable = await ethers.getContractFactory("ERC1155SupplyUpgradeable");
    erc1155Contract = await ERC1155SupplyUpgradeable.deploy();
    await erc1155Contract.deployed();

    ERC20ProxyStorage = await ethers.getContractFactory("ERC20ProxyStorage");
    erc20ProxyStorage = await ERC20ProxyStorage.deploy();
    await erc20ProxyStorage.deployed();

    const [owner] = await ethers.getSigners();
    await erc20ProxyStorage.initializeERC20Proxy(erc1155Contract.address, childTokenId, name, symbol);
  });

  it("should initialize ERC20 proxy storage correctly", async function () {
    const layout = await erc20ProxyStorage.layout();
    expect(layout.erc1155Contract).to.equal(erc1155Contract.address);
    expect(layout.childTokenId).to.equal(childTokenId);
    expect(layout.name).to.equal(name);
    expect(layout.symbol).to.equal(symbol);
  });

  it("should return the correct name", async function () {
    expect(await erc20ProxyStorage.name()).to.equal(name);
  });

  it("should return the correct symbol", async function () {
    expect(await erc20ProxyStorage.symbol()).to.equal(symbol);
  });

  it("should return the correct decimals", async function () {
    expect(await erc20ProxyStorage.decimals()).to.equal(18);
  });

  it("should return the correct total supply", async function () {
    await erc1155Contract.mint(childTokenId, 1000);
    expect(await erc20ProxyStorage.totalSupply()).to.equal(1000);
  });

  it("should return the correct balance of an account", async function () {
    const [owner, addr1] = await ethers.getSigners();
    await erc1155Contract.mint(childTokenId, 1000);
    await erc1155Contract.safeTransferFrom(owner.address, addr1.address, childTokenId, 500, "0x");
    expect(await erc20ProxyStorage.balanceOf(addr1.address)).to.equal(500);
  });

  it("should transfer tokens correctly", async function () {
    const [owner, addr1] = await ethers.getSigners();
    await erc1155Contract.mint(childTokenId, 1000);
    await erc20ProxyStorage.transfer(addr1.address, 500);
    expect(await erc20ProxyStorage.balanceOf(addr1.address)).to.equal(500);
  });

  it("should approve tokens correctly", async function () {
    const [owner, addr1] = await ethers.getSigners();
    await erc20ProxyStorage.approve(addr1.address, 500);
    expect(await erc20ProxyStorage.allowance(owner.address, addr1.address)).to.equal(500);
  });

  it("should transfer tokens from one address to another correctly", async function () {
    const [owner, addr1, addr2] = await ethers.getSigners();
    await erc1155Contract.mint(childTokenId, 1000);
    await erc20ProxyStorage.approve(addr1.address, 500);
    await erc20ProxyStorage.connect(addr1).transferFrom(owner.address, addr2.address, 500);
    expect(await erc20ProxyStorage.balanceOf(addr2.address)).to.equal(500);
  });
});