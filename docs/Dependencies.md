Install Dependencies
Copy Markdown
Open
A guide to setting up your local Solana development environment. Learn how to install Rust, the Solana CLI, and Anchor Framework on Windows (WSL), Linux, and Mac. Use this guide if you prefer to install each dependency individually, or if the quick installation fails for any reason.

Prerequisites
Windows
Linux
Install Rust
Developers build Solana programs using the Rust programming language.

Install Rust using rustup by entering the following command in your terminal:
Terminal
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
After a successful installation you will see the following message:

Successful Rust Install Message
Reload your PATH environment variable to include Cargo's bin directory:
Terminal
. "$HOME/.cargo/env"
Verify that the installation was successful.
Terminal
rustc --version
You will see output like the following:


rustc 1.86.0 (05f9846f8 2025-03-31)
Install Solana CLI
The Solana CLI provides all the tools required to build and deploy Solana programs.

Install the Solana CLI tool suite by using the official install command:
Terminal
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
You can replace stable with the release tag matching the software version of your desired release (i.e. v2.0.3), or use one of the three symbolic channel names: stable, beta, or edge.

Add a PATH environment variable
A first-time installation of the Solana CLI, may prompt you to add a PATH environment variable. To do so, close and reopen your terminal or run the following in your shell:


export PATH="/Users/test/.local/share/solana/install/active_release/bin:$PATH"
Update your PATH environment variable
Windows & Linux
Mac
If you are using Linux or WSL, you must add the Solana CLI binary to your PATH so that the command is available in your terminal. To do so, follow the steps below:

a. Check which shell you are using:

Terminal
echo $SHELL
If the output contains /bash, use .bashrc.
If the output contains /zsh, use .zshrc.
b. Run the appropriate command, based on your shell.

For Bash (bashrc):

Terminal
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
For Zsh (zshrc):

Terminal
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
Restart your terminal or run the following command to refresh the terminal session:
Terminal
source ~/.bashrc # If using Bash
source ~/.zshrc # If using Zsh
Verify that the installation succeeded by checking the Solana CLI version:
Terminal
solana --version
You will see output like the following:


solana-cli 2.2.12 (src:0315eb6a; feat:1522022101, client:Agave)
You can view all available versions on the Agave Github repo. Agave is the validator client from Anza, formerly known as Solana Labs validator client.

Update the Solana CLI to the latest version, as needed (Optional)
Terminal
agave-install update
Install Anchor CLI
Anchor is a framework for developing Solana programs. The Anchor framework leverages Rust macros to simplify the process of writing Solana programs.

Prerequisites
The default Anchor project test file (TypeScript) created with the anchor init command requires Node.js and Yarn. (The Rust test template is available using anchor init --test-template rust)

Node Installation
Yarn Installation
Installation
You can install the Anchor CLI and tooling in two ways:

Anchor Version Manager (AVM) — Recommended installation method
Without AVM — Install directly from GitHub
AVM
Without AVM
The Anchor Version Manager (AVM) allows you to install and manage different Anchor versions on your system and easily update Anchor versions in the future. To install Anchor using AVM, follow the steps below:

Install AVM with the following command:
Terminal
cargo install --git https://github.com/solana-foundation/anchor avm --force
Confirm that AVM installed successfully:
Terminal
avm --version
Install Anchor CLI using AVM:
To install the latest version:

Terminal
avm install latest
avm use latest
To install a specific version, specify the version number:

Terminal
avm install 0.30.1
avm use 0.30.1
When installing the Anchor CLI on Linux or WSL, you may encounter this error:


error: could not exec the linker cc = note: Permission denied (os error 13)
If you see this error message, follow these steps:

Install the dependencies listed in the Linux section at the top of this page.
Retry installing the Anchor CLI.
Verify that the installation succeeded, by checking the Anchor CLI version:
Terminal
anchor --version
You will see output like the following:


anchor-cli 0.31.1
Don't forget to run the avm use command to declare the Anchor CLI version to run on your system.

If you installed the latest version, run avm use latest.
If you installed the version 0.30.1, run avm use 0.30.1.
Install Surfpool CLI
Surfpool is a tool for local development and an improved replacement for solana-test-validator. Learn more about Surfpool features in the Surfpool documentation.

Install Surfpool with the following command:
Terminal
curl -sL https://run.surfpool.run/ | bash
Verify that the installation was successful by checking the Surfpool CLI version:
Terminal
surfpool --version
You will see output like the following:


surfpool 0.12.0
Set up AI tooling for Solana development
This section details optional AI tooling setup you can use to accelerate your Solana development.

Tool	Description	Link
MCP	MCP server that you can connect to with cursor to improve Solana AI assisted development.	https://mcp.solana.com/
LLMs.txt	LLM optimized documentation that you can use to train LLMs on Solana docs.	https://solana.com/llms.txt


Solana CLI Basics
Copy Markdown
Open
This section provides some common commands and examples to help you get you started using the Solana CLI.

Solana config
Your Solana config specifies the following variables:

Config file: The path to your config file
RPC URL & Websocket URL: The Solana cluster to which the CLI makes requests
Keypair path: The path to the default Solana wallet (keypair) used to pay transaction fees and deploy programs. By default, this file is stored at ~/.config/solana/id.json.
To see your current configuration settings, enter the follow command in your terminal.

Terminal
solana config get
A successful command will return output similar to the following:

Example output

Config File: /Users/test/.config/solana/cli/config.yml
RPC URL: https://api.mainnet-beta.solana.com
WebSocket URL: wss://api.mainnet-beta.solana.com/ (computed)
Keypair Path: /Users/test/.config/solana/id.json
Commitment: confirmed
You can change the Solana CLI cluster with the following commands:

Full commands
Short commands
Terminal
solana config set --url mainnet-beta
solana config set --url devnet
solana config set --url localhost
solana config set --url testnet
Create a wallet
Before you can send a transactions using the Solana CLI, you need a Solana wallet funded with SOL.

To generate a keypair at the default keypair path, run the following command:

Terminal
solana-keygen new
A successful command will return output similar to the following:

Example output

Generating a new keypair

For added security, enter a BIP39 passphrase

NOTE! This passphrase improves security of the recovery seed phrase NOT the
keypair file itself, which is stored as insecure plain text

BIP39 Passphrase (empty for none):

Wrote new keypair to /Users/test/.config/solana/id.json
===========================================================================
pubkey: 8dBTPrjnkXyuQK3KDt9wrZBfizEZijmmUQXVHpFbVwGT
===========================================================================
Save this seed phrase and your BIP39 passphrase to recover your new keypair:
cream bleak tortoise ocean nasty game gift forget fancy salon mimic amazing
===========================================================================
This command will not override an existing account at the default location, unless you use the --force flag.

To view your wallet's address (public key), run:

Terminal
solana address
Airdrop SOL
Request an airdrop of SOL to your wallet to pay for transactions and program deployments.

Set your cluster to Devnet:
Terminal
solana config set -ud
Request an airdrop of Devnet SOL:
Terminal
solana airdrop 2
Devnet airdrops limit requests to 5 SOL per request. If you hit rate limits or encounter errors, try using the Web Faucet instead.

To check your wallet's SOL balance, run the following command:

Terminal
solana balance


Solana Documentation
Getting Started
Installation
Anchor CLI Basics
Copy Markdown
Open
This section provides some common commands and examples to help you get started using the Anchor CLI.

Initialize the project
Create a new Anchor project by running the command shown below. It will create a new directory with the project name and use it to initialize a new Anchor project.

Terminal
anchor init <project-name>
For example, the command below will create a project called my-project. The my-project directory will contain a basic Rust program and TypeScript test template.

Terminal
anchor init my-project
Then navigate to the project directory:

Terminal
cd <project-name>
See Anchor's project file structure.

Build the program
To build your project, run the following command:

Terminal
anchor build
You can find the compiled program in the /target/deploy directory.

When running anchor build, if you encounter the following errors:

error: not a directory
lock file version 4 requires `-Znext-lockfile-bump
After applying the preceding solution, attempt to run anchor build again.

Deploy the program
To deploy your project, run the following command:

Terminal
anchor deploy
This command deploys your program to the cluster specified in the Anchor.toml file.

Test the program
To test your project, run the following command:

Terminal
anchor test
This command builds, deploys, and runs the tests for your project.

When using the localnet cluster, Anchor automatically starts a local validator, deploys the program, runs tests, then stops the validator.

Either of the following errors may indicate that you don't have Node.js or Yarn installed:


Permission denied (os error 13)

No such file or directory (os error 2)


Solana Documentation
Getting Started
Installation
Surfpool CLI Basics
Copy Markdown
Open
Surfpool is a local development tool that simplifies Solana development by automatically loading programs and accounts from a cluster (mainnet, devnet). Use the Surfpool CLI to start a local validator for testing your programs and transactions.

Visit the Surfpool documentation for more information.

Start a local validator
To start a local validator, run the following command:

Terminal
surfpool start
By default, Surfpool automatically loads any programs and accounts your transactions depend on from mainnet to the local validator.

Surfpool Studio
Surfpool Studio provides a web-based interface for interacting with your local validator. Use it to:

View transactions details
Inspect account data
Airdrop SOL and other tokens using the UI faucet
To access Surfpool Studio:

Start your local validator with surfpool start
Open your browser and navigate to http://127.0.0.1:18488