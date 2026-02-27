import chalk from "chalk";

const query = `query product ($id: ID, $code: String) {
  product (id: $id, code: $code) {
    code
    createdAt
    description
    everythingInPlus
    id
    internalNotes
    name
    plansToDisplay
    platformId
    productCategoryId
    showProductNameOnLineItem
    updatedAt
    features {
        code
        createdAt
        description
        id
        isProvisioned
        isUnit
        isVisible
        name
        position
        productId
        unitName
        updatedAt
    }
    plans {
        addon
        availableFrom
        availableTo
        basePrice
        code
        contactUsLabel
        contactUsUrl
        createdAt
        description
        id
        internalNotes
        isAvailableNow
        isVisible
        name
        position
        pricingDescription
        productId
        productPlanName
        selfServiceBuy
        selfServiceCancel
        selfServiceRenew
        updatedAt
        priceLists {
            basePrice
            code
            createdAt
            currencyId
            id
            isVisible
            monthlyBasePrice
            name
            periodMonths
            planId
            productId
            priceAdjustmentPercentage
            priceDescription
            renewalTermMonths
            showPriceAsMonthly
            sku
            trialAllowed
            trialLengthDays
            trialExpirationAction
            updatedAt
            charges {
                accountingCode
                avalaraAfcSaleType
                avalaraAfcServiceType
                avalaraAfcTransactionType
                basePrice
                code
                createdAt
                featureAddon
                featureId
                feature {
                    code
                }
                billingPeriod
                chargeType
                pricingModel
                usageCalculationType
                financialAccountId
                hidePeriodsOnInvoice
                id
                isTelecomCharge
                longName
                name
                position
                price
                priceDecimals
                priceDescription
                priceListId
                productId
                quantityMax
                quantityMin
                recognitionPeriod
                roundUpInterval
                selfServiceQuantity
                showPriceAsMonthly
                specificInvoiceLineText
                taxCode
                updatedAt
                priceListChargeTiers {
                    price
                    starts
                }
            }
        }
    }
  }
}`;

const productQuery = async (client, variables) => {
  try {
    const response = await client.query(query, variables);
    return response.data.product;
  } catch (error) {
    console.log(chalk.red("Error fetching product.", error));
    throw error;
  }
};

export default productQuery;
