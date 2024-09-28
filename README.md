# bunny-cli

CLI for managing Bunny

## Prerequisites

- Node.js (version 14 or higher)
- npm (Node Package Manager)

## Installation

1. **Clone the repository from GitHub:**

   ```bash
   git clone https://github.com/yourusername/bunny-cli.git
   cd bunny-cli
   ```

2. **Install the dependencies:**

   ```bash
   npm install
   ```

3. **Link the CLI globally:**

   ```bash
   npm link
   ```

## Configuration

Before using the CLI, you need to configure it with your Bunny instance details.

1. **Configure a profile:**

   ```bash
   bunny configure
   ```

   You will be prompted to enter the profile name, client ID, client secret, and Bunny instance URL. The profile name defaults to `default`.

## Usage

### Import Products

To import products from a JSON file:

```bash
bunny import products --file=products.json
```

### Import Subscriptions

To import subscriptions from a CSV file:

```bash
bunny import subscriptions --file=subscriptions.csv
```

### Import Historical MRR (Monthly Recurring Revenue)

To import MRR from a CSV file:

```bash
bunny import mrr --file=mrr.csv
```

### Using Different Profiles

You can specify a different profile using the `--profile` option:

```bash
bunny import products --file=products.json --profile=alternate
```

In this case, the credentials for the profile named `alternate` will be used.

## Local development

When running with a local development version of Bunny you will encounter an error about SSL certificate validation. You can override this by supplying the `--unsafe` option.

```bash
bunny import products --file=products.json --unsafe
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
